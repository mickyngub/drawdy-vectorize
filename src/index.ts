import type {
    DriverCommandIssuer,
    DriverManifest,
    DriverModule,
    ModuleStyling,
} from "@drawdy/driver-protocol";
import {
    DEFAULT_PEN,
    MAX_POINTS,
    MAX_STROKES,
    batches,
    countPoints,
    isValidStroke,
    strokeElements,
    targetRect,
} from "./lib/placement";
import type {
    DriverToWebview,
    Pen,
    Rect,
    StrokeWidthSpec,
    WebviewToDriver,
} from "./shared/messages";
import { WEBVIEW_HTML } from "./webview-html";

// Drawdy shows this through <img>, where currentColor is black, so the colours are explicit.
const ACTION_BUTTON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="18" height="18"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#g)"/><g transform="translate(12 12) scale(0.72) translate(-12 -12)"><path d="M5 18C8 6 16 18 19 6" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/><rect x="2.8" y="15.8" width="4.4" height="4.4" rx="0.8" fill="#ffffff"/><rect x="16.8" y="3.8" width="4.4" height="4.4" rx="0.8" fill="#ffffff"/></g></svg>`;

const PARAMS_KV_KEY = "params";
const FLY_DURATION_MS = 350;

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
    params: Record<string, unknown> | null;
    loadedId: string | null;
} | null = null;

let chain: Promise<void> = Promise.resolve();

const nextRequestId = (): string => String(requestId++);

function stylingCssVars(styling: ModuleStyling): string {
    return Object.entries(styling)
        .map(([key, value]) =>
            key === "theme"
                ? `color-scheme: ${value};`
                : `--drawdy-${key.replace(
                      /[A-Z]/g,
                      (c) => `-${c.toLowerCase()}`
                  )}: ${value};`
        )
        .join("");
}

function enqueue(task: () => Promise<void>): Promise<void> {
    const next = chain.then(task).catch(() => undefined);
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
        params: null,
        loadedId: null,
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
        issueCommand({
            type: "subscription:scene:drawdy-element-selection",
            driverId,
            requestId: nextRequestId(),
        }),
    ]);

    const stored = await issueCommand({
        type: "command:kv-storage:get",
        driverId,
        requestId: nextRequestId(),
        req: { key: PARAMS_KV_KEY },
    });
    if (driver && stored.res.error === undefined) {
        const restored = stored.res.value?.got?.[PARAMS_KV_KEY];
        if (restored && typeof restored === "object") {
            driver.params = restored as Record<string, unknown>;
        }
    }
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
            await handleWebviewMessage(message as WebviewToDriver);
            return;
        }
        case "subscription:dom:theme-changed": {
            driver.styling = event.body.styling;
            if (!driver.webviewOpen) driver.webviewHtml = null;
            return;
        }
        case "subscription:scene:drawdy-element-selection": {
            if (!driver.webviewOpen) return;
            const ids = event.body.drawdyElementIds;
            if (ids.length !== 1) {
                driver.loadedId = null;
                return;
            }
            await loadImage(ids[0], false);
            return;
        }
        default: {
            return;
        }
    }
};

async function openWebview(): Promise<void> {
    if (!driver) return;
    const reopening = driver.webviewHtml !== null;
    const html =
        driver.webviewHtml ??
        WEBVIEW_HTML.replace(
            "/*__DRAWDY_STYLING__*/",
            stylingCssVars(driver.styling)
        );
    driver.webviewHtml = html;
    await driver.issueCommand({
        type: "command:webview:create",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: {
            webviewDomId: driver.webviewId,
            htmlContent: html,
            keepStateWhenClosed: true,
        },
    });
    if (!driver) return;
    driver.webviewOpen = true;
    if (reopening) {
        post({ type: "pen", pen: await readPen() });
        await loadSelection(false);
    }
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
    if (res.res.error !== undefined) return;
    const ids = res.res.value.drawdyElementIds;
    if (ids.length !== 1) {
        if (explicit)
            post({
                type: "error",
                message: "Select one image on the board first.",
            });
        return;
    }
    await loadImage(ids[0], explicit);
}

async function loadImage(id: string, explicit: boolean): Promise<void> {
    if (!driver) return;
    if (!explicit && driver.loadedId === id) return;
    const { driverId } = driver.manifest;
    const found = await driver.issueCommand({
        type: "command:scene:get-drawdy-elements",
        driverId,
        requestId: nextRequestId(),
        req: { properties: ["type"], drawdyElementIds: [id] },
    });
    if (!driver || found.res.error !== undefined) return;
    if (found.res.value.drawdyElements[0]?.type !== "image") {
        driver.loadedId = null;
        if (explicit)
            post({
                type: "error",
                message: "Select one image on the board first.",
            });
        return;
    }
    const [source, rect] = await Promise.all([
        driver.issueCommand({
            type: "command:scene:get-image-source",
            driverId,
            requestId: nextRequestId(),
            req: { drawdyElementId: id },
        }),
        elementRect(id),
    ]);
    if (!driver) return;
    if (source.res.error !== undefined || !rect) {
        post({
            type: "error",
            message: "The selected image could not be read.",
        });
        return;
    }
    driver.loadedId = id;
    post({
        type: "source",
        blob: source.res.value.blob,
        elementId: id,
        displayWidth: rect.width,
        displayHeight: rect.height,
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
            driver.webviewOpen = true;
            driver.loadedId = null;
            post({
                type: "init",
                params: driver.params ?? undefined,
                pen: await readPen(),
            });
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
        case "close": {
            driver.webviewOpen = false;
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

async function viewRect(): Promise<Rect | null> {
    if (!driver) return null;
    const res = await driver.issueCommand({
        type: "command:camera:get-viewport-rect",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
    });
    if (res.res.error !== undefined) return null;
    return res.res.value.rect;
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

    const source =
        typeof message.sourceId === "string"
            ? await elementRect(message.sourceId)
            : null;
    const view = source ? null : await viewRect();
    const pen = await readPen();
    if (!driver) return;
    const { driverId } = driver.manifest;
    const elements = strokeElements({
        strokes,
        imageWidth,
        rect: targetRect(imageWidth, imageHeight, source, view),
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

    let placed = 0;
    for (const batch of batches(elements)) {
        const added = await driver.issueCommand({
            type: "command:scene:add-drawdy-elements",
            driverId,
            requestId: nextRequestId(),
            req: { elements: batch },
        });
        if (!driver) return;
        if (added.res.error !== undefined) {
            post({
                type: "error",
                message: placed
                    ? `The board took ${placed} strokes, then rejected the rest.`
                    : "The board rejected those strokes.",
            });
            return;
        }
        placed += batch.length;
        if (placed < elements.length)
            post({ type: "progress", placed, total: elements.length });
    }

    await driver.issueCommand({
        type: "command:camera:fly-to-elements",
        driverId,
        requestId: nextRequestId(),
        req: {
            drawdyElementIds: elements.map((e) => e.drawdyElementId),
            flyDurationMs: FLY_DURATION_MS,
            zoom: 1,
        },
    });
    post({ type: "placed", strokes: placed });
}
