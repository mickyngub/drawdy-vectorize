import {
    DEFAULT_PEN,
    MAX_POINTS,
    MAX_STROKES,
    PLACE_WIDTH,
    boardStrokeWidth,
} from "../src/lib/placement";
import type {
    DriverToWebview,
    Pen,
    WebviewToDriver,
} from "../src/shared/messages";
import { wireKeys } from "./lib/keys";
import { previewPaths } from "./lib/paths";
import {
    COLOUR_MODES,
    MODES,
    RANGES,
    RESOLUTIONS,
    sanitizeParams,
} from "./lib/params";
import { looksLikePhoto } from "./lib/photo";
import { borderIsDark, histogram, otsu } from "./lib/raster";
import {
    DEFAULTS,
    TraceCache,
    traceImage,
    type ColourMode,
    type Mode,
    type Params,
    type TraceResult,
    type Working,
} from "./lib/trace";
import {
    el,
    makeCheckbox,
    makeRule,
    makeSegmented,
    makeSlider,
    type CheckControl,
    type SegmentedControl,
    type SliderControl,
} from "./ui";

type DrawdyWebviewApi = {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    onMessage(listener: (message: unknown) => void): () => void;
};

declare function acquireDrawdyApi(): DrawdyWebviewApi;

type Source = {
    id: string;
    image: CanvasImageSource;
    width: number;
    height: number;
    board: { elementId: string; displayWidth: number } | null;
};

const PARAMS_DEBOUNCE_MS = 400;
const TRACE_DEBOUNCE_MS = 150;
const PLACE_TIMEOUT_MS = 20_000;
// A mode chosen before any image is loaded counts for the next image.
const NEXT_IMAGE = "next";
const PREVIEW_POINT_BUDGET = 400_000;
const SVG_NS = "http://www.w3.org/2000/svg";
const UPLOAD_HINT =
    "Select an image on the board, or click here to upload one. You can also drop or paste an image.";

const api = acquireDrawdyApi();

const stage = document.getElementById("stage") as HTMLDivElement;
const frame = document.getElementById("frame") as HTMLDivElement;
const sourceCanvas = document.getElementById("source") as HTMLCanvasElement;
const svg = document.getElementById("preview") as unknown as SVGSVGElement;
const hint = document.getElementById("hint") as HTMLDivElement;
const hintText = document.getElementById("hint-text") as HTMLSpanElement;
const panel = document.getElementById("panel") as HTMLElement;
const statusLine = document.getElementById("status") as HTMLDivElement;
const placeButton = document.getElementById("place") as HTMLButtonElement;
const uploadInput = document.getElementById("upload-input") as HTMLInputElement;
const stylingTag = document.getElementById(
    "drawdy-styling"
) as HTMLStyleElement;

let params: Params = { ...DEFAULTS };
let pen: Pen = DEFAULT_PEN;
let source: Source | null = null;
let working: Working | null = null;
let result: TraceResult | null = null;
let autoTune = false;
let tracing = false;
let placing = false;
let generation = 0;
let sourceCount = 0;
let paramsTimer = 0;
let traceTimer = 0;
let placeTimer = 0;
let savedMode: Mode = DEFAULTS.mode;
let modePickedFor: string | null = null;
let selectedIds: string[] = [];
let sourceNote: string | null = null;
const cache = new TraceCache();

function send(message: WebviewToDriver): void {
    api.postMessage(message);
}

function queueParams(): void {
    if (paramsTimer) clearTimeout(paramsTimer);
    paramsTimer = setTimeout(() => {
        paramsTimer = 0;
        send({
            type: "params",
            params: { ...params, mode: savedMode } as unknown as Record<
                string,
                unknown
            >,
        });
    }, PARAMS_DEBOUNCE_MS) as unknown as number;
}

function setStatus(text: string, tone: "" | "good" | "bad" = ""): void {
    statusLine.textContent = text;
    statusLine.title = text;
    statusLine.className = `status${tone ? ` ${tone}` : ""}`;
}

function setHint(text: string | null): void {
    if (text === null) {
        hint.hidden = true;
        return;
    }
    hintText.textContent = text;
    hint.hidden = false;
}

const readoutLine = document.createElement("span");
const sourceText = document.createElement("span");

const sourceKey = (src: Source): string => src.board?.elementId ?? src.id;

function showSource(): void {
    if (!source) sourceText.textContent = "No image yet";
    else if (!source.board) sourceText.textContent = "Using your uploaded image";
    else
        sourceText.textContent =
            selectedIds.length === 1 && selectedIds[0] === source.board.elementId
                ? "Using the selected image"
                : "Using the last selected image";
}

function pickMode(mode: Mode): void {
    savedMode = mode;
    modePickedFor = source ? sourceKey(source) : NEXT_IMAGE;
}

const controls: {
    mode: SegmentedControl<Mode> | null;
    threshold: SliderControl | null;
    invert: CheckControl | null;
    colours: SliderControl | null;
    dropBackground: CheckControl | null;
    detail: SliderControl | null;
    smooth: CheckControl | null;
    specks: SliderControl | null;
    widthMode: SegmentedControl<"auto" | "fixed"> | null;
    width: SliderControl | null;
    colour: SegmentedControl<ColourMode> | null;
    custom: HTMLInputElement | null;
    resolution: SegmentedControl<number> | null;
    thresholdGroup: HTMLElement | null;
    layersGroup: HTMLElement | null;
    colourRow: HTMLElement | null;
    layersNote: HTMLElement | null;
} = {
    mode: null,
    threshold: null,
    invert: null,
    colours: null,
    dropBackground: null,
    detail: null,
    smooth: null,
    specks: null,
    widthMode: null,
    width: null,
    colour: null,
    custom: null,
    resolution: null,
    thresholdGroup: null,
    layersGroup: null,
    colourRow: null,
    layersNote: null,
};

const targetWidth = (): number =>
    source?.board ? source.board.displayWidth : PLACE_WIDTH;

function resolvedWidth(): number | null {
    if (!result || !working) return null;
    return boardStrokeWidth(
        result.strokeWidth,
        targetWidth() / working.w,
        pen.width
    );
}

function applyDerivedState(): void {
    const layers = params.mode === "layers";
    if (controls.thresholdGroup) controls.thresholdGroup.hidden = layers;
    if (controls.layersGroup) controls.layersGroup.hidden = !layers;
    if (controls.colourRow) controls.colourRow.hidden = layers;
    if (controls.layersNote) controls.layersNote.hidden = !layers;
    if (controls.custom) controls.custom.hidden = params.colour !== "custom";
    controls.width?.setDim(params.widthAuto);
    showWidth();
}

function showWidth(): void {
    if (!controls.width) return;
    if (!params.widthAuto) {
        controls.width.setText(params.width.toFixed(1));
        return;
    }
    const width = resolvedWidth();
    controls.width.setText(width === null ? "Auto" : `Auto · ${width}`);
}

function commit(next: Partial<Params>, persist = true): void {
    const before = params;
    params = { ...params, ...next };
    applyDerivedState();
    if (persist) queueParams();
    const traceKeys: (keyof Params)[] = [
        "mode",
        "threshold",
        "invert",
        "detail",
        "smooth",
        "specks",
        "widthAuto",
        "width",
        "colour",
        "custom",
        "colours",
        "dropBackground",
        "resolution",
    ];
    if (traceKeys.some((key) => before[key] !== params[key])) scheduleTrace();
    else renderPreview();
}

function pushControls(): void {
    controls.mode?.set(params.mode);
    controls.threshold?.set(params.threshold);
    controls.invert?.set(params.invert);
    controls.colours?.set(params.colours);
    controls.dropBackground?.set(params.dropBackground);
    controls.detail?.set(params.detail);
    controls.smooth?.set(params.smooth);
    controls.specks?.set(params.specks);
    controls.widthMode?.set(params.widthAuto ? "auto" : "fixed");
    controls.width?.set(params.width);
    controls.colour?.set(params.colour);
    if (controls.custom) controls.custom.value = params.custom;
    controls.resolution?.set(params.resolution);
    applyDerivedState();
}

function buildPanel(): void {
    const head = el("div", "readout", panel);
    readoutLine.textContent = "No strokes yet";
    head.appendChild(readoutLine);
    const resetButton = el("button", undefined, head);
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    resetButton.addEventListener("click", () => {
        pickMode(DEFAULTS.mode);
        commit({ ...DEFAULTS });
        pushControls();
    });

    const sourceRow = el("div", "source", panel);
    sourceText.textContent = "No image yet";
    sourceRow.appendChild(sourceText);
    const useSelected = el("button", "small-btn", sourceRow);
    useSelected.type = "button";
    useSelected.textContent = "Use selected image";
    useSelected.addEventListener("click", () => {
        setStatus("Reading the selected image…");
        send({ type: "use-selection" });
    });

    controls.mode = makeSegmented<Mode>(
        panel,
        "Mode",
        MODES,
        params.mode,
        (mode) => {
            pickMode(mode);
            commit({ mode });
        }
    );

    makeRule(panel);

    controls.thresholdGroup = el("div", "group", panel);
    controls.threshold = makeSlider(
        controls.thresholdGroup,
        { label: "Threshold", ...RANGES.threshold },
        params.threshold,
        (threshold) => commit({ threshold })
    );
    const auto = el("button", "small-btn", controls.threshold.head);
    auto.type = "button";
    auto.textContent = "Auto";
    auto.setAttribute("aria-label", "Auto threshold");
    auto.addEventListener("click", () => {
        if (!working) return;
        const threshold = otsu(histogram(cache.luminance(working)));
        controls.threshold?.set(threshold);
        commit({ threshold });
    });
    controls.invert = makeCheckbox(
        controls.thresholdGroup,
        "Invert: light lines on dark",
        params.invert,
        (invert) => commit({ invert })
    );

    controls.layersGroup = el("div", "group", panel);
    controls.colours = makeSlider(
        controls.layersGroup,
        { label: "Colours", ...RANGES.colours },
        params.colours,
        (colours) => commit({ colours })
    );
    controls.dropBackground = makeCheckbox(
        controls.layersGroup,
        "Drop background",
        params.dropBackground,
        (dropBackground) => commit({ dropBackground })
    );

    controls.detail = makeSlider(
        panel,
        {
            label: "Detail tolerance",
            ...RANGES.detail,
            format: (v) => `${v.toFixed(1)} px`,
        },
        params.detail,
        (detail) => commit({ detail })
    );
    controls.specks = makeSlider(
        panel,
        {
            label: "Ignore specks smaller than",
            ...RANGES.specks,
            format: (v) => `${v} px²`,
        },
        params.specks,
        (specks) => commit({ specks })
    );
    controls.smooth = makeCheckbox(
        panel,
        "Smooth curves",
        params.smooth,
        (smooth) => commit({ smooth })
    );

    makeRule(panel);

    controls.widthMode = makeSegmented<"auto" | "fixed">(
        panel,
        "Stroke width",
        [
            ["auto", "Auto"],
            ["fixed", "Fixed"],
        ],
        params.widthAuto ? "auto" : "fixed",
        (mode) => commit({ widthAuto: mode === "auto" })
    );
    controls.width = makeSlider(
        panel,
        { label: "Width on the board", ...RANGES.width },
        params.width,
        (width) => commit({ width })
    );

    controls.colourRow = el("div", "field", panel);
    const colourHead = el("div", "field-head", controls.colourRow);
    el("label", undefined, colourHead).textContent = "Colour";
    const colourLine = el("div", "colour-row", controls.colourRow);
    const colourSeg = el("div", "seg", colourLine);
    colourSeg.setAttribute("role", "group");
    colourSeg.setAttribute("aria-label", "Colour");
    controls.colour = {
        set: makeColourModes(colourSeg),
        wrap: controls.colourRow,
    };
    controls.custom = el("input", undefined, colourLine);
    controls.custom.type = "color";
    controls.custom.value = params.custom;
    controls.custom.setAttribute("aria-label", "Custom colour");
    controls.custom.addEventListener("input", () => {
        commit({ custom: controls.custom!.value });
    });
    controls.layersNote = el("div", "note", panel);
    controls.layersNote.textContent =
        "Keeps the image's colours, so dark or white parts can vanish on a board of the same colour.";

    makeRule(panel);

    controls.resolution = makeSegmented<number>(
        panel,
        "Working resolution (longest side, px)",
        RESOLUTIONS,
        params.resolution,
        (resolution) => commit({ resolution })
    );
}

function makeColourModes(row: HTMLElement): (value: ColourMode) => void {
    const buttons = COLOUR_MODES.map(([value, text]) => {
        const button = el("button", undefined, row);
        button.type = "button";
        button.textContent = text;
        button.addEventListener("click", () => {
            paint(value);
            commit({ colour: value });
        });
        return { value, button };
    });
    const paint = (current: ColourMode) => {
        for (const entry of buttons) {
            const on = entry.value === current;
            entry.button.classList.toggle("on", on);
            entry.button.setAttribute("aria-pressed", String(on));
        }
    };
    paint(params.colour);
    return paint;
}

function fitFrame(): void {
    if (!working) return;
    const box = stage.getBoundingClientRect();
    const availableWidth = Math.max(40, box.width - 30);
    const availableHeight = Math.max(40, box.height - 30);
    const scale = Math.min(
        availableWidth / working.w,
        availableHeight / working.h
    );
    frame.style.width = `${Math.floor(working.w * scale)}px`;
    frame.style.height = `${Math.floor(working.h * scale)}px`;
}

function buildWorking(src: Source, resolution: number): Working | null {
    const scale = resolution / Math.max(src.width, src.height);
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(src.image, 0, 0, w, h);
    let data: ImageData;
    try {
        data = context.getImageData(0, 0, w, h);
    } catch {
        return null;
    }
    const previewScale = Math.min(1, 1024 / Math.max(w, h));
    sourceCanvas.width = Math.max(1, Math.round(w * previewScale));
    sourceCanvas.height = Math.max(1, Math.round(h * previewScale));
    const preview = sourceCanvas.getContext("2d");
    preview?.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    preview?.drawImage(canvas, 0, 0, sourceCanvas.width, sourceCanvas.height);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    return { id: `${src.id}@${resolution}`, rgba: data.data, w, h };
}

const tick = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, 0));

function scheduleTrace(immediate = false): void {
    if (traceTimer) clearTimeout(traceTimer);
    traceTimer = 0;
    generation++;
    if (!source) return;
    tracing = true;
    readoutLine.textContent = "Tracing…";
    updatePlaceButton();
    if (immediate) {
        void runTrace();
        return;
    }
    traceTimer = setTimeout(() => {
        traceTimer = 0;
        void runTrace();
    }, TRACE_DEBOUNCE_MS) as unknown as number;
}

async function runTrace(): Promise<void> {
    const run = ++generation;
    const src = source;
    if (!src) return;
    await tick();
    if (run !== generation) return;
    const key = `${src.id}@${params.resolution}`;
    if (!working || working.id !== key) {
        working = buildWorking(src, params.resolution);
        if (!working) {
            tracing = false;
            result = null;
            renderPreview();
            setStatus("That image could not be read.", "bad");
            return;
        }
        fitFrame();
    }
    if (autoTune) {
        autoTune = false;
        const gray = cache.luminance(working);
        const threshold = otsu(histogram(gray));
        const invert = borderIsDark(gray, working.w, working.h, threshold);
        params = { ...params, threshold, invert };
        controls.threshold?.set(threshold);
        controls.invert?.set(invert);
        if (modePickedFor !== sourceKey(src)) {
            const mode = looksLikePhoto(working.rgba, working.w, working.h)
                ? "layers"
                : savedMode;
            params = { ...params, mode };
            controls.mode?.set(mode);
            applyDerivedState();
        }
    }
    const traced = await traceImage(
        working,
        params,
        cache,
        () => run !== generation,
        tick
    );
    if (!traced || run !== generation) return;
    tracing = false;
    result = traced;
    renderPreview();
}

function overLimit(): string | null {
    if (!result) return null;
    if (result.strokes.length > MAX_STROKES)
        return `${result.strokes.length.toLocaleString()} strokes is over the ${MAX_STROKES.toLocaleString()} limit. Raise Detail tolerance or Ignore specks.`;
    if (result.points > MAX_POINTS)
        return `${result.points.toLocaleString()} points is over the ${MAX_POINTS.toLocaleString()} limit. Raise Detail tolerance or Ignore specks.`;
    return null;
}

function updatePlaceButton(): void {
    placeButton.disabled =
        placing ||
        tracing ||
        !result ||
        result.strokes.length === 0 ||
        overLimit() !== null;
}

function renderPreview(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    showWidth();
    updatePlaceButton();
    if (!result || !working) {
        readoutLine.textContent = "No strokes yet";
        return;
    }
    const strokes = result.strokes.length;
    readoutLine.textContent = `${strokes.toLocaleString()} ${
        strokes === 1 ? "stroke" : "strokes"
    } · ${result.points.toLocaleString()} points`;
    const width = resolvedWidth() ?? pen.width;
    const scale = targetWidth() / working.w;
    for (const path of previewPaths(
        result.strokes,
        params.smooth,
        pen.color,
        PREVIEW_POINT_BUDGET
    )) {
        const node = document.createElementNS(SVG_NS, "path");
        node.setAttribute("d", path.d);
        node.setAttribute("fill", "none");
        node.setAttribute("stroke", path.color);
        node.setAttribute("stroke-width", String(width / scale));
        node.setAttribute("stroke-linecap", "round");
        node.setAttribute("stroke-linejoin", "round");
        svg.appendChild(node);
    }
    const limit = overLimit();
    if (limit) setStatus(limit, "bad");
    else if (result.empty) setStatus(result.empty);
    else if (!placing) setStatus(sourceNote ?? "");
}

function stopPlacing(): void {
    if (placeTimer) clearTimeout(placeTimer);
    placeTimer = 0;
    placing = false;
    updatePlaceButton();
}

function place(): void {
    if (!result || !working || !source || overLimit() || placing) return;
    placing = true;
    updatePlaceButton();
    setStatus("Placing…");
    placeTimer = setTimeout(() => {
        stopPlacing();
        setStatus("Drawdy didn't answer. Try again.", "bad");
    }, PLACE_TIMEOUT_MS) as unknown as number;
    send({
        type: "place",
        strokes: result.strokes,
        imageWidth: working.w,
        imageHeight: working.h,
        strokeWidth: result.strokeWidth,
        spline: params.smooth,
        sourceId: source.board?.elementId ?? null,
        params: params as unknown as Record<string, unknown>,
    });
}

function adoptSource(
    image: CanvasImageSource,
    width: number,
    height: number,
    board: Source["board"]
): void {
    sourceCount += 1;
    source = {
        id: `vectorize-${sourceCount}`,
        image,
        width,
        height,
        board,
    };
    working = null;
    result = null;
    autoTune = true;
    if (modePickedFor === NEXT_IMAGE) modePickedFor = sourceKey(source);
    showSource();
    stage.classList.remove("empty");
    stage.setAttribute("aria-label", "Change image");
    frame.hidden = false;
    setHint(null);
    setStatus("");
    scheduleTrace(true);
}

async function decode(blob: Blob): Promise<{
    image: CanvasImageSource;
    width: number;
    height: number;
} | null> {
    try {
        const bitmap = await createImageBitmap(blob);
        return { image: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
        // createImageBitmap cannot decode SVG, so fall back to an <img>.
    }
    const url = URL.createObjectURL(blob);
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const width = img.naturalWidth || 1024;
        const height = img.naturalHeight || 1024;
        return { image: img, width, height };
    } catch {
        return null;
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
}

async function adoptBlob(
    blob: Blob,
    board: Source["board"],
    failure: string,
    note: string | null = null
): Promise<void> {
    const decoded = await decode(blob);
    if (!decoded) {
        setStatus(failure, "bad");
        return;
    }
    sourceNote = note;
    adoptSource(decoded.image, decoded.width, decoded.height, board);
    if (note) setStatus(note);
}

function imageFileFrom(items: DataTransfer | null): File | null {
    if (!items) return null;
    for (const file of Array.from(items.files)) {
        if (file.type.startsWith("image/")) return file;
    }
    return null;
}

function wireInput(): void {
    placeButton.addEventListener("click", place);
    stage.addEventListener("click", () => uploadInput.click());
    stage.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        uploadInput.click();
    });
    uploadInput.addEventListener("change", () => {
        const file = uploadInput.files?.[0];
        uploadInput.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setStatus("That file is not an image.", "bad");
            return;
        }
        void adoptBlob(file, null, "That file could not be read as an image.");
    });
    const over = (event: DragEvent) => {
        event.preventDefault();
        stage.classList.add("dragover");
    };
    stage.addEventListener("dragover", over);
    stage.addEventListener("dragenter", over);
    stage.addEventListener("dragleave", () =>
        stage.classList.remove("dragover")
    );
    stage.addEventListener("drop", (event) => {
        event.preventDefault();
        stage.classList.remove("dragover");
        const file = imageFileFrom(event.dataTransfer);
        if (!file) {
            if (event.dataTransfer?.files.length)
                setStatus("That file is not an image.", "bad");
            return;
        }
        void adoptBlob(file, null, "That file could not be read as an image.");
    });
    document.addEventListener("paste", (event) => {
        const file = imageFileFrom(event.clipboardData);
        if (!file) return;
        event.preventDefault();
        void adoptBlob(file, null, "That file could not be read as an image.");
    });
    wireKeys({
        history: (action) => send({ type: "history", action }),
        close: () => send({ type: "close" }),
    });
    new ResizeObserver(fitFrame).observe(stage);
}

function handle(message: DriverToWebview): void {
    switch (message.type) {
        case "init": {
            params = sanitizeParams(message.params);
            savedMode = params.mode;
            if (message.pen) pen = message.pen;
            pushControls();
            if (source) scheduleTrace(true);
            return;
        }
        case "pen": {
            pen = message.pen;
            renderPreview();
            return;
        }
        case "theme": {
            stylingTag.textContent = `:root{${message.css}}`;
            return;
        }
        case "selection": {
            selectedIds = Array.isArray(message.ids) ? message.ids : [];
            showSource();
            return;
        }
        case "source": {
            if (!(message.blob instanceof Blob)) {
                setStatus("The selected image could not be read.", "bad");
                return;
            }
            void adoptBlob(
                message.blob,
                {
                    elementId: message.elementId,
                    displayWidth: message.displayWidth,
                },
                "The selected image could not be read.",
                typeof message.note === "string" ? message.note : null
            );
            return;
        }
        case "placed": {
            stopPlacing();
            setStatus(
                `Placed the trace (${message.strokes.toLocaleString()} ${
                    message.strokes === 1 ? "stroke" : "strokes"
                }). Press ⌘Z or Ctrl+Z to undo.`,
                "good"
            );
            return;
        }
        case "error": {
            stopPlacing();
            setStatus(message.message, "bad");
            return;
        }
    }
}

buildPanel();
wireInput();
pushControls();
setHint(UPLOAD_HINT);

api.onMessage((raw) => {
    if (!raw || typeof raw !== "object") return;
    handle(raw as DriverToWebview);
});

send({ type: "ready" });
