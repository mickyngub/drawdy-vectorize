import type {
    DriverCommandIssuer,
    DriverManifest,
    DriverModule,
    ModuleStyling,
} from "@drawdy/driver-protocol";
import { readBoardImage } from "./lib/board-image";
import { findFreeRect, revealAndSelect, visibleArea } from "./lib/free-spot";
import {
    DEFAULT_PEN,
    MAX_POINTS,
    MAX_STROKES,
    countPoints,
    isValidStroke,
    preferredRect,
    strokeElements,
} from "./lib/placement";
import type {
    DriverToWebview,
    Pen,
    Rect,
    StrokeWidthSpec,
    WebviewToDriver,
} from "./shared/messages";
import { WEBVIEW_HTML } from "./webview-html";
import { ACTION_BUTTON_SVG } from "./action-button";

const PARAMS_KV_KEY = "params";
const PERMISSION_MESSAGE =
    "Vectorize needs permission to read the board. Reload the page and click Allow.";
const BOARD_FULL_MESSAGE =
    "The board is full: it holds at most 10,000 elements. Remove some, then try again.";
const FAILED_MESSAGE = "Something went wrong. Try again.";
const PICK_IMAGE_MESSAGE = "Select one image on the board first.";

let requestId = 0;

let driver: {
    manifest: DriverManifest;
    issueCommand: DriverCommandIssuer;
    generateId: () => string;
    styling: ModuleStyling;
    actionButtonId: string;
    webviewId: string;
    webviewHtml: string | null;
    webviewOpen: boolean;
    panelLoaded: boolean;
    panelReady: boolean;
    started: boolean;
    params: Record<string, unknown> | null;
    loadedId: string | null;
    readSeq: number;
} | null = null;

let chain: Promise<void> = Promise.resolve();

const nextRequestId = (): string => String(requestId++);

function stylingCssVars(styling: ModuleStyling): string {
    const { tokens, ...flat } = styling as ModuleStyling & {
        tokens?: Record<string, string>;
    };
    const vars = Object.entries(flat).map(([key, value]) =>
        key === "theme"
            ? `color-scheme: ${value};`
            : `--drawdy-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`
    );
    for (const [name, value] of Object.entries(tokens ?? {}))
        vars.push(`${name}: ${value};`);
    return vars.join("");
}

function enqueue(task: () => Promise<void>): Promise<void> {
    const next = chain
        .then(task)
        .catch(() => post({ type: "error", message: FAILED_MESSAGE }));
    chain = next;
    return next;
}

function post(message: DriverToWebview): void {
    if (!driver) return;
    void driver.issueCommand({
        type: "command:webview:post-message",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { webviewDomId: driver.webviewId, message },
    });
}

function boardContext() {
    return {
        issueCommand: driver!.issueCommand,
        driverId: driver!.manifest.driverId,
        nextRequestId,
        webviewDomId: driver!.webviewId,
    };
}

const denied = (error: { type: string } | undefined): boolean =>
    error?.type === "unauthorized";

export const activate: DriverModule["activate"] = async ({
    manifest,
    issueCommand,
    styling,
    generateId,
}) => {
    driver = {
        manifest,
        issueCommand,
        generateId,
        styling,
        actionButtonId: `${manifest.driverId}:action-button`,
        webviewId: `${manifest.driverId}:webview`,
        webviewHtml: null,
        webviewOpen: false,
        panelLoaded: false,
        panelReady: false,
        started: false,
        params: null,
        loadedId: null,
        readSeq: 0,
    };
    const { driverId } = manifest;

    const created = await issueCommand({
        type: "command:dom:create-action-button",
        driverId,
        requestId: nextRequestId(),
        req: { domElementId: driver.actionButtonId, svg: ACTION_BUTTON_SVG },
    });
    if (created.res.error !== undefined) return;

    await Promise.all([
        issueCommand({
            type: "subscription:dom:element-clicked",
            driverId,
            requestId: nextRequestId(),
            req: { domElementId: driver.actionButtonId },
        }),
        issueCommand({
            type: "subscription:webview:message",
            driverId,
            requestId: nextRequestId(),
            req: { webviewDomId: driver.webviewId },
        }),
        issueCommand({
            type: "subscription:dom:theme-changed",
            driverId,
            requestId: nextRequestId(),
        }),
    ]);
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
    if (!driver) return;
    switch (event.type) {
        case "subscription:dom:element-clicked": {
            if (event.body.domElementId !== driver.actionButtonId) return;
            await enqueue(openWebview);
            return;
        }
        case "subscription:webview:message": {
            if (event.body.webviewDomId !== driver.webviewId) return;
            const message = event.body.message;
            if (typeof message !== "object" || message === null) return;
            try {
                await handleWebviewMessage(message as WebviewToDriver);
            } catch {
                post({ type: "error", message: FAILED_MESSAGE });
            }
            return;
        }
        case "subscription:dom:theme-changed": {
            driver.styling = event.body.styling;
            driver.webviewHtml = null;
            if (driver.panelReady) {
                post({ type: "theme", css: stylingCssVars(driver.styling) });
            }
            return;
        }
        case "subscription:scene:drawdy-element-selection": {
            if (!driver.webviewOpen || !driver.panelReady) return;
            const ids = event.body.drawdyElementIds;
            post({ type: "selection", ids });
            if (ids.length === 1) await loadImage(ids[0], false);
            return;
        }
        default: {
            return;
        }
    }
};

async function openWebview(): Promise<void> {
    if (!driver) return;
    if (driver.webviewHtml === null) {
        driver.webviewHtml = WEBVIEW_HTML.replace(
            "/*__DRAWDY_STYLING__*/",
            stylingCssVars(driver.styling)
        );
    }
    await driver.issueCommand({
        type: "command:webview:create",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: {
            webviewDomId: driver.webviewId,
            htmlContent: driver.webviewHtml,
            keepStateWhenClosed: true,
        },
    });
    if (!driver) return;
    driver.webviewOpen = true;
    // The host keeps the hidden panel alive, so it sends no second ready.
    if (!driver.panelLoaded) return;
    driver.panelReady = true;
    post({ type: "theme", css: stylingCssVars(driver.styling) });
    post({ type: "pen", pen: await readPen() });
    await loadSelection(false);
}

// Runs on the panel's first ready, so no prompt appears before the user opens Vectorize.
async function start(): Promise<void> {
    if (!driver || driver.started) return;
    driver.started = true;
    const { driverId } = driver.manifest;
    const stored = await driver.issueCommand({
        type: "command:kv-storage:get",
        driverId,
        requestId: nextRequestId(),
        req: { key: PARAMS_KV_KEY },
    });
    if (!driver) return;
    if (stored.res.error === undefined) {
        const restored = stored.res.value?.got?.[PARAMS_KV_KEY];
        if (restored && typeof restored === "object") {
            driver.params = restored as Record<string, unknown>;
        }
    }
    await driver.issueCommand({
        type: "subscription:scene:drawdy-element-selection",
        driverId,
        requestId: nextRequestId(),
    });
}

async function readPen(): Promise<Pen> {
    if (!driver) return DEFAULT_PEN;
    const res = await driver.issueCommand({
        type: "command:scene:query-tool-style-state",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { toolId: "pencil" },
    });
    if (res.res.error !== undefined) return DEFAULT_PEN;
    const state = res.res.value.state;
    if (!state || state.toolId !== "pencil") return DEFAULT_PEN;
    return {
        color: state.strokeColor || DEFAULT_PEN.color,
        width: state.strokeWidth > 0 ? state.strokeWidth : DEFAULT_PEN.width,
    };
}

async function loadSelection(explicit: boolean): Promise<void> {
    if (!driver) return;
    const res = await driver.issueCommand({
        type: "command:scene:get-current-selected-drawdy-elements",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
    });
    if (!driver) return;
    if (res.res.error !== undefined) {
        if (denied(res.res.error)) {
            post({ type: "error", message: PERMISSION_MESSAGE });
        } else if (explicit) {
            post({ type: "error", message: PICK_IMAGE_MESSAGE });
        }
        return;
    }
    const ids = res.res.value.drawdyElementIds;
    post({ type: "selection", ids });
    if (ids.length !== 1) {
        if (explicit) post({ type: "error", message: PICK_IMAGE_MESSAGE });
        return;
    }
    await loadImage(ids[0], explicit);
}

async function loadImage(id: string, explicit: boolean): Promise<void> {
    if (!driver) return;
    if (!explicit && driver.loadedId === id) return;
    const seq = ++driver.readSeq;
    const read = await readBoardImage(boardContext(), id);
    if (!driver || seq !== driver.readSeq) return;
    if (!read.ok) {
        if (read.reason === "permission") {
            post({ type: "error", message: PERMISSION_MESSAGE });
        } else if (read.reason === "not-image") {
            driver.loadedId = null;
            if (explicit) post({ type: "error", message: PICK_IMAGE_MESSAGE });
        } else {
            post({
                type: "error",
                message: "The selected image could not be read.",
            });
        }
        return;
    }
    driver.loadedId = id;
    post({
        type: "source",
        blob: read.image.blob,
        elementId: id,
        displayWidth: read.image.rect.width,
        displayHeight: read.image.rect.height,
        note: read.image.note,
    });
}

async function elementRect(id: string): Promise<Rect | null> {
    if (!driver) return null;
    const res = await driver.issueCommand({
        type: "command:scene:element-rects",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: { drawdyElementIds: [id] },
    });
    if (res.res.error !== undefined) return null;
    return res.res.value.rects[0]?.rect ?? null;
}

async function handleWebviewMessage(message: WebviewToDriver): Promise<void> {
    if (!driver) return;
    switch (message.type) {
        case "ready": {
            driver.panelLoaded = true;
            driver.panelReady = true;
            driver.webviewOpen = true;
            driver.loadedId = null;
            await start();
            if (!driver) return;
            post({
                type: "init",
                params: driver.params ?? undefined,
                pen: await readPen(),
            });
            post({ type: "theme", css: stylingCssVars(driver.styling) });
            await loadSelection(false);
            return;
        }
        case "params": {
            const params = message.params;
            if (typeof params !== "object" || params === null) return;
            driver.params = params;
            await driver.issueCommand({
                type: "command:kv-storage:set",
                driverId: driver.manifest.driverId,
                requestId: nextRequestId(),
                req: {
                    key: PARAMS_KV_KEY,
                    payload: { [PARAMS_KV_KEY]: params },
                },
            });
            return;
        }
        case "use-selection": {
            await loadSelection(true);
            return;
        }
        case "place": {
            await enqueue(() => place(message));
            return;
        }
        case "history": {
            const { driverId } = driver.manifest;
            const requestId = nextRequestId();
            await (message.action === "redo"
                ? driver.issueCommand({
                      type: "command:history:redo",
                      driverId,
                      requestId,
                  })
                : driver.issueCommand({
                      type: "command:history:undo",
                      driverId,
                      requestId,
                  }));
            return;
        }
        case "close": {
            driver.webviewOpen = false;
            driver.panelReady = false;
            await driver.issueCommand({
                type: "command:webview:hide",
                driverId: driver.manifest.driverId,
                requestId: nextRequestId(),
                req: { webviewDomId: driver.webviewId },
            });
            return;
        }
    }
}

function validWidth(spec: unknown): spec is StrokeWidthSpec {
    if (!spec || typeof spec !== "object") return false;
    const { unit, value } = spec as { unit?: unknown; value?: unknown };
    if (unit === "pen") return true;
    if (unit !== "px" && unit !== "board") return false;
    return typeof value === "number" && value > 0 && value < 1000;
}

async function place(
    message: Extract<WebviewToDriver, { type: "place" }>
): Promise<void> {
    if (!driver) return;
    const { strokes, imageWidth, imageHeight } = message;
    if (
        !Array.isArray(strokes) ||
        strokes.length === 0 ||
        !strokes.every(isValidStroke) ||
        !(imageWidth > 0) ||
        !(imageHeight > 0) ||
        !validWidth(message.strokeWidth)
    ) {
        post({ type: "error", message: "Those strokes could not be read." });
        return;
    }
    if (strokes.length > MAX_STROKES || countPoints(strokes) > MAX_POINTS) {
        post({
            type: "error",
            message:
                "That is over the limit of 3,000 strokes and 200,000 points.",
        });
        return;
    }

    const board = boardContext();
    const source =
        typeof message.sourceId === "string"
            ? await elementRect(message.sourceId)
            : null;
    const area = source ? null : await visibleArea(board);
    const rect = await findFreeRect(
        board,
        preferredRect(imageWidth, imageHeight, source, area)
    );
    const pen = await readPen();
    if (!driver) return;
    const { driverId } = driver.manifest;
    const elements = strokeElements({
        strokes,
        imageWidth,
        rect,
        strokeWidth: message.strokeWidth,
        spline: message.spline === true,
        pen,
        driverId,
        params:
            message.params && typeof message.params === "object"
                ? message.params
                : {},
        generateId: driver.generateId,
    });

    const added = await driver.issueCommand({
        type: "command:scene:add-drawdy-elements",
        driverId,
        requestId: nextRequestId(),
        req: { elements },
    });
    if (!driver) return;
    if (added.res.error !== undefined) {
        post({ type: "error", message: "The board rejected those strokes." });
        return;
    }
    // Over the board's element cap the host adds nothing and still reports success.
    if (!(await elementRect(elements[0].drawdyElementId))) {
        post({ type: "error", message: BOARD_FULL_MESSAGE });
        return;
    }
    await revealAndSelect(
        board,
        elements.map((e) => e.drawdyElementId),
        rect
    );
    post({ type: "placed", strokes: elements.length });
}
