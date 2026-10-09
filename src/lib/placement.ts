import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import type {
    Pen,
    Rect,
    StrokeSpec,
    StrokeWidthSpec,
} from "../shared/messages";
import { centredIn, rightOf } from "./free-spot";

export type FreedrawSchema = Extract<DrawdyElementSchema, { type: "freedraw" }>;

export const PLACE_WIDTH = 480;
export const MAX_STROKES = 3000;
export const MAX_POINTS = 200_000;
export const DEFAULT_PEN: Pen = { color: "#1e1e1e", width: 2 };

const round2 = (value: number): number => Math.round(value * 100) / 100;

// Beside a board image at its height, or centred in the visible area for an upload.
export function preferredRect(
    imageWidth: number,
    imageHeight: number,
    source: Rect | null,
    area: Rect | null
): Rect {
    const aspect = imageHeight / imageWidth;
    if (source) return rightOf(source, source.height / aspect, source.height);
    const width = PLACE_WIDTH;
    const height = width * aspect;
    return area ? centredIn(area, width, height) : { x: 0, y: 0, width, height };
}

export function mapPoints(
    points: number[],
    imageWidth: number,
    rect: Rect
): number[] {
    const scale = rect.width / imageWidth;
    const out = new Array<number>(points.length);
    for (let i = 0; i + 1 < points.length; i += 2) {
        out[i] = round2(rect.x + points[i] * scale);
        out[i + 1] = round2(rect.y + points[i + 1] * scale);
    }
    return out;
}

export function boardStrokeWidth(
    spec: StrokeWidthSpec,
    scale: number,
    penWidth: number
): number {
    const raw =
        spec.unit === "pen"
            ? penWidth
            : spec.unit === "px"
              ? spec.value * scale
              : spec.value;
    return Math.max(0.5, Math.round(raw * 10) / 10);
}

export function countPoints(strokes: StrokeSpec[]): number {
    let total = 0;
    for (const stroke of strokes) total += stroke.points.length / 2;
    return total;
}

export function isValidStroke(stroke: unknown): stroke is StrokeSpec {
    if (!stroke || typeof stroke !== "object") return false;
    const { points, color } = stroke as StrokeSpec;
    if (!Array.isArray(points) || points.length < 4 || points.length % 2)
        return false;
    if (color !== null && typeof color !== "string") return false;
    return points.every((v) => typeof v === "number" && Number.isFinite(v));
}

function bounds(points: number[]): { width: number; height: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < points.length; i += 2) {
        minX = Math.min(minX, points[i]);
        maxX = Math.max(maxX, points[i]);
        minY = Math.min(minY, points[i + 1]);
        maxY = Math.max(maxY, points[i + 1]);
    }
    return { width: maxX - minX, height: maxY - minY };
}

export function strokeElements(args: {
    strokes: StrokeSpec[];
    imageWidth: number;
    rect: Rect;
    strokeWidth: StrokeWidthSpec;
    spline: boolean;
    pen: Pen;
    driverId: string;
    params: Record<string, unknown>;
    generateId: () => string;
}): FreedrawSchema[] {
    const scale = args.rect.width / args.imageWidth;
    const strokeWidth = boardStrokeWidth(
        args.strokeWidth,
        scale,
        args.pen.width
    );
    const groupId = args.generateId();
    return args.strokes.map((stroke, index) => {
        const points = mapPoints(stroke.points, args.imageWidth, args.rect);
        const size = bounds(points);
        return {
            type: "freedraw",
            drawdyElementId: args.generateId(),
            groupId,
            points,
            width: size.width,
            height: size.height,
            spline: args.spline,
            strokeColor: stroke.color ?? args.pen.color,
            strokeWidth,
            opacity: 1,
            meta: {
                [args.driverId]:
                    index === 0
                        ? { v: 1, params: args.params }
                        : { v: 1, part: true },
            },
        };
    });
}
