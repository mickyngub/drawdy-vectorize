import type {
    DriverCommandIssuer,
    SubscribedDrawdyElement,
} from "@drawdy/driver-protocol";
import { union, type Rect } from "./free-spot";

type Ctx = {
    issueCommand: DriverCommandIssuer;
    driverId: string;
    nextRequestId: () => string;
};

export type BoardImage = {
    blob: Blob;
    /** The displayed, unrotated rect on the board. */
    rect: Rect;
    note: string | null;
};

export type BoardImageResult =
    | { ok: true; image: BoardImage }
    | { ok: false; reason: "permission" | "not-image" | "unreadable" };

type Reply<T> =
    { ok: true; value: T } | { ok: false; reason: "permission" | "unreadable" };

export const FULL_IMAGE_NOTE = "Using the full original image.";
export const CAPTURE_PADDING = 20;
const ASPECT_TOLERANCE = 0.01;
// No panel works above 2048 px, so a rotated copy never needs more.
export const MAX_ROTATED_SIDE = 2048;

export function isCropped(
    rect: Rect,
    sourceWidth: number,
    sourceHeight: number
): boolean {
    if (!(rect.width > 0 && rect.height > 0)) return false;
    if (!(sourceWidth > 0 && sourceHeight > 0)) return false;
    const ratio = rect.width / rect.height / (sourceWidth / sourceHeight);
    return Math.abs(ratio - 1) > ASPECT_TOLERANCE;
}

export function isRotated(rotation: unknown): rotation is number {
    if (typeof rotation !== "number" || !Number.isFinite(rotation))
        return false;
    const turn = Math.PI * 2;
    const r = ((rotation % turn) + turn) % turn;
    return Math.min(r, turn - r) > 1e-4;
}

/** Where `rect` sits in a capture-screenshot PNG of everything drawn in it (`drawn`). */
export function captureCrop(
    rect: Rect,
    drawn: Rect,
    png: { width: number; height: number }
): Rect {
    const sx = png.width / (drawn.width + 2 * CAPTURE_PADDING);
    const sy = png.height / (drawn.height + 2 * CAPTURE_PADDING);
    return {
        x: (rect.x - drawn.x + CAPTURE_PADDING) * sx,
        y: (rect.y - drawn.y + CAPTURE_PADDING) * sy,
        width: rect.width * sx,
        height: rect.height * sy,
    };
}

export function rotatedBox(
    width: number,
    height: number,
    rotation: number,
    maxSide = MAX_ROTATED_SIDE
): { width: number; height: number; scale: number } {
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const w = width * cos + height * sin;
    const h = width * sin + height * cos;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    return {
        width: Math.max(1, Math.round(w * scale)),
        height: Math.max(1, Math.round(h * scale)),
        scale,
    };
}

async function call<T>(
    ctx: Ctx,
    type: string,
    req?: unknown
): Promise<Reply<T>> {
    try {
        const res = (await ctx.issueCommand({
            type,
            driverId: ctx.driverId,
            requestId: ctx.nextRequestId(),
            req,
        } as Parameters<DriverCommandIssuer>[0])) as {
            res: { error?: { type?: string }; value?: T };
        };
        if (res.res.error !== undefined) {
            return {
                ok: false,
                reason:
                    res.res.error.type === "unauthorized"
                        ? "permission"
                        : "unreadable",
            };
        }
        return { ok: true, value: res.res.value as T };
    } catch {
        return { ok: false, reason: "unreadable" };
    }
}

async function decode(blob: Blob): Promise<ImageBitmap | null> {
    try {
        return await createImageBitmap(blob);
    } catch {
        return null;
    }
}

function surface(
    width: number,
    height: number
): {
    canvas: OffscreenCanvas;
    context: OffscreenCanvasRenderingContext2D;
} | null {
    if (typeof OffscreenCanvas === "undefined") return null;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    return { canvas, context };
}

async function encodePng(canvas: OffscreenCanvas): Promise<Blob | null> {
    try {
        return await canvas.convertToBlob({ type: "image/png" });
    } catch {
        return null;
    }
}

async function rotate(
    bitmap: ImageBitmap,
    rotation: number
): Promise<Blob | null> {
    const box = rotatedBox(bitmap.width, bitmap.height, rotation);
    const target = surface(box.width, box.height);
    if (!target) return null;
    const { context } = target;
    context.translate(box.width / 2, box.height / 2);
    context.rotate(rotation);
    context.scale(box.scale, box.scale);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return encodePng(target.canvas);
}

async function capture(ctx: Ctx, rect: Rect): Promise<Blob | null> {
    const shot = await call<{ png: Blob }>(
        ctx,
        "command:scene:capture-screenshot",
        { area: rect }
    );
    if (!shot.ok) return null;
    const hits = await call<{ drawdyElements: SubscribedDrawdyElement[] }>(
        ctx,
        "command:scene:query-rect",
        { rect, properties: ["type"] }
    );
    if (!hits.ok) return null;
    const rects = await call<{ rects: { rect: Rect }[] }>(
        ctx,
        "command:scene:element-rects",
        { drawdyElementIds: hits.value.drawdyElements.map((e) => e.id) }
    );
    if (!rects.ok) return null;
    const drawn = union(rects.value.rects.map((r) => r.rect));
    if (!drawn) return null;
    const png = await decode(shot.value.png);
    if (!png) return null;
    try {
        const crop = captureCrop(rect, drawn, png);
        const width = Math.max(1, Math.round(crop.width));
        const height = Math.max(1, Math.round(crop.height));
        const target = surface(width, height);
        if (!target) return null;
        target.context.drawImage(
            png,
            crop.x,
            crop.y,
            crop.width,
            crop.height,
            0,
            0,
            width,
            height
        );
        return encodePng(target.canvas);
    } finally {
        png.close();
    }
}

/**
 * Reads a board image as the user sees it. A crop (detected by a changed aspect ratio) comes
 * from a screenshot of the board; a rotation alone is applied to the original file.
 */
export async function readBoardImage(
    ctx: Ctx,
    id: string
): Promise<BoardImageResult> {
    const found = await call<{ drawdyElements: SubscribedDrawdyElement[] }>(
        ctx,
        "command:scene:get-drawdy-elements",
        {
            properties: ["type", "x", "y", "width", "height", "rotation"],
            drawdyElementIds: [id],
        }
    );
    if (!found.ok) return found;
    const element = found.value.drawdyElements[0];
    if (element?.type !== "image") return { ok: false, reason: "not-image" };
    const rect = {
        x: element.x ?? NaN,
        y: element.y ?? NaN,
        width: element.width ?? NaN,
        height: element.height ?? NaN,
    };
    if (
        !Object.values(rect).every(Number.isFinite) ||
        !(rect.width > 0 && rect.height > 0)
    ) {
        return { ok: false, reason: "unreadable" };
    }
    const source = await call<{ blob: Blob }>(
        ctx,
        "command:scene:get-image-source",
        { drawdyElementId: id }
    );
    if (!source.ok) return source;
    const blob = source.value.blob;
    const done = (out: Blob, note: string | null = null): BoardImageResult => ({
        ok: true,
        image: { blob: out, rect, note },
    });
    // A worker cannot decode SVG, and SVG has no fixed pixel size to compare against.
    const bitmap = await decode(blob);
    if (!bitmap) return done(blob);
    try {
        if (isCropped(rect, bitmap.width, bitmap.height)) {
            const seen = await capture(ctx, rect);
            return seen ? done(seen) : done(blob, FULL_IMAGE_NOTE);
        }
        if (isRotated(element.rotation)) {
            const turned = await rotate(bitmap, element.rotation);
            return turned ? done(turned) : done(blob, FULL_IMAGE_NOTE);
        }
        return done(blob);
    } finally {
        bitmap.close();
    }
}
