import type { StrokeSpec, StrokeWidthSpec } from "../../src/shared/messages";
import { traceContours, type Contour } from "./contours";
import {
    backgroundCluster,
    clusterColours,
    clusterMask,
    toHex,
    type Clusters,
} from "./kmeans";
import {
    binarize,
    countOn,
    fillHoles,
    inkField,
    luminance,
    removeSpecks,
    type Rgba,
} from "./raster";
import { traceSkeleton } from "./skeleton";
import {
    closeRing,
    polylineLength,
    prepareSpline,
    rdp,
    rdpClosed,
    smoothPolyline,
} from "./simplify";
import { distanceTransform, medianThickness, zhangSuenSteps } from "./thinning";

export type Mode = "outline" | "centerline" | "layers";
export type ColourMode = "pen" | "image" | "custom";

export type Params = {
    mode: Mode;
    threshold: number;
    invert: boolean;
    detail: number;
    smooth: boolean;
    specks: number;
    widthAuto: boolean;
    width: number;
    colour: ColourMode;
    custom: string;
    colours: number;
    dropBackground: boolean;
    resolution: number;
};

export const DEFAULTS: Params = {
    mode: "outline",
    threshold: 128,
    invert: false,
    detail: 1,
    smooth: true,
    specks: 16,
    widthAuto: true,
    width: 2,
    colour: "pen",
    custom: "#2563eb",
    colours: 4,
    dropBackground: true,
    resolution: 1024,
};

export const GAP_BRIDGE_PX = 2;

export type Working = {
    id: string;
    rgba: Rgba;
    w: number;
    h: number;
};

export type TraceResult = {
    strokes: StrokeSpec[];
    points: number;
    strokeWidth: StrokeWidthSpec;
    thicknessPx: number | null;
    // Set when nothing came out, to say why.
    empty: string | null;
};

export class TraceCache {
    private grayKey = "";
    private gray: Uint8Array | null = null;
    private clusterKey = "";
    private clusters: Clusters | null = null;

    luminance(src: Working): Uint8Array {
        if (this.grayKey !== src.id || !this.gray) {
            this.gray = luminance(src.rgba, src.w, src.h);
            this.grayKey = src.id;
        }
        return this.gray;
    }

    clustersFor(src: Working, k: number): Clusters {
        const key = `${src.id}|${k}`;
        if (this.clusterKey !== key || !this.clusters) {
            this.clusters = clusterColours(src.rgba, src.w, src.h, k);
            this.clusterKey = key;
        }
        return this.clusters;
    }
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const rounded = (points: number[]): number[] => points.map(round2);

export function averageColour(
    points: number[],
    rgba: Rgba,
    w: number,
    h: number,
    mask: Uint8Array
): string | null {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const step = Math.max(2, Math.floor(points.length / 400) * 2);
    for (let i = 0; i + 1 < points.length; i += step) {
        const x0 = Math.floor(points[i] - 0.5);
        const y0 = Math.floor(points[i + 1] - 0.5);
        for (let y = y0; y <= y0 + 1; y++) {
            for (let x = x0; x <= x0 + 1; x++) {
                if (x < 0 || y < 0 || x >= w || y >= h) continue;
                const j = y * w + x;
                if (!mask[j]) continue;
                r += rgba[j * 4];
                g += rgba[j * 4 + 1];
                b += rgba[j * 4 + 2];
                n++;
            }
        }
    }
    return n ? toHex(r / n, g / n, b / n) : null;
}

function strokeColour(
    params: Params,
    points: number[],
    src: Working,
    mask: Uint8Array
): string | null {
    if (params.colour === "custom") return params.custom;
    if (params.colour === "image")
        return averageColour(points, src.rgba, src.w, src.h, mask);
    return null;
}

const splineSegment = (w: number, h: number): number =>
    Math.max(6, Math.max(w, h) / 80);

function finishLine(
    points: number[],
    params: Params,
    w: number,
    h: number
): number[] {
    return params.smooth
        ? prepareSpline(points, splineSegment(w, h), params.detail)
        : points;
}

function contourStroke(
    contour: Contour,
    params: Params,
    w: number,
    h: number
): number[] | null {
    const ring = rdpClosed(contour.points, params.detail);
    if (ring.length < 4) return null;
    return finishLine(closeRing(ring), params, w, h);
}

function widthSpec(
    params: Params,
    thicknessPx: number | null
): StrokeWidthSpec {
    if (!params.widthAuto) return { unit: "board", value: params.width };
    if (thicknessPx !== null) return { unit: "px", value: thicknessPx };
    return { unit: "pen" };
}

function finish(
    strokes: StrokeSpec[],
    params: Params,
    thicknessPx: number | null,
    empty: string
): TraceResult {
    let points = 0;
    for (const stroke of strokes) points += stroke.points.length / 2;
    return {
        strokes,
        points,
        strokeWidth: widthSpec(params, thicknessPx),
        thicknessPx,
        empty: strokes.length ? null : empty,
    };
}

const NO_INK =
    "Nothing to trace at this threshold. Try Auto, or turn Invert on or off.";

// Resolves to null when `cancelled` turns true between steps.
export async function traceImage(
    src: Working,
    params: Params,
    cache: TraceCache,
    cancelled: () => boolean,
    tick: () => Promise<void>
): Promise<TraceResult | null> {
    const { w, h } = src;

    if (params.mode === "layers") {
        const clusters = cache.clustersFor(src, params.colours);
        await tick();
        if (cancelled()) return null;
        const skip = params.dropBackground
            ? backgroundCluster(clusters.labels, w, h, clusters.counts)
            : -1;
        const strokes: StrokeSpec[] = [];
        for (let c = 0; c < clusters.colors.length; c++) {
            if (c === skip) continue;
            const contours = traceContours(
                clusterMask(clusters.labels, c),
                w,
                h
            )
                .filter((contour) => contour.area >= params.specks)
                .sort((a, b) => b.area - a.area);
            for (const contour of contours) {
                const points = contourStroke(contour, params, w, h);
                if (points)
                    strokes.push({
                        points: rounded(points),
                        color: clusters.colors[c],
                    });
            }
            await tick();
            if (cancelled()) return null;
        }
        return finish(
            strokes,
            params,
            null,
            "Every colour region is smaller than Ignore specks, or only the background is left."
        );
    }

    const gray = cache.luminance(src);
    if (params.mode === "outline") {
        const mask = binarize(gray, params.threshold, params.invert);
        if (!countOn(mask)) return finish([], params, null, NO_INK);
        const field = inkField(gray, params.threshold, params.invert);
        const contours = traceContours(mask, w, h, field)
            .filter((contour) => contour.area >= params.specks)
            .sort((a, b) => b.area - a.area);
        await tick();
        if (cancelled()) return null;
        const strokes: StrokeSpec[] = [];
        for (const contour of contours) {
            const points = contourStroke(contour, params, w, h);
            if (!points) continue;
            strokes.push({
                points: rounded(points),
                color: strokeColour(params, contour.points, src, mask),
            });
        }
        return finish(strokes, params, null, NO_INK);
    }

    const mask = fillHoles(
        removeSpecks(
            binarize(gray, params.threshold, params.invert),
            w,
            h,
            params.specks
        ),
        w,
        h,
        params.specks
    );
    if (!countOn(mask)) return finish([], params, null, NO_INK);
    await tick();
    if (cancelled()) return null;
    const steps = zhangSuenSteps(mask, w, h);
    let skeleton: Uint8Array;
    for (;;) {
        const step = steps.next();
        if (step.done) {
            skeleton = step.value;
            break;
        }
        await tick();
        if (cancelled()) return null;
    }
    const thickness = medianThickness(distanceTransform(mask, w, h), skeleton);
    await tick();
    if (cancelled()) return null;
    const lines = traceSkeleton(skeleton, w, h, {
        minLength: Math.max(4, thickness * 2),
        bridge: GAP_BRIDGE_PX,
    }).sort((a, b) => polylineLength(b) - polylineLength(a));
    const strokes: StrokeSpec[] = [];
    for (const line of lines) {
        const n = line.length;
        const closed =
            n > 6 && line[0] === line[n - 2] && line[1] === line[n - 1];
        const smooth = smoothPolyline(line, 2);
        const points = finishLine(
            closed
                ? closeRing(rdpClosed(smooth.slice(0, -2), params.detail))
                : rdp(smooth, params.detail),
            params,
            w,
            h
        );
        if (points.length < 4) continue;
        strokes.push({
            points: rounded(points),
            color: strokeColour(params, line, src, mask),
        });
    }
    return finish(strokes, params, Math.round(thickness * 10) / 10, NO_INK);
}
