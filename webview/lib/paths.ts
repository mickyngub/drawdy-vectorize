import type { StrokeSpec } from "../../src/shared/messages";

const f = (v: number): string => String(Math.round(v * 10) / 10);

export function polylinePath(points: number[]): string {
    let d = `M${f(points[0])} ${f(points[1])}`;
    for (let i = 2; i + 1 < points.length; i += 2) {
        d += `L${f(points[i])} ${f(points[i + 1])}`;
    }
    return d;
}

// The board's own curve: uniform Catmull-Rom through every point, as cubic Béziers. Open ends repeat
// their end point; a stroke whose last point equals its first wraps round.
export function splinePath(points: number[]): string {
    const n = points.length / 2;
    if (n < 3) return polylinePath(points);
    const closed =
        n > 3 &&
        points[0] === points[n * 2 - 2] &&
        points[1] === points[n * 2 - 1];
    const ring = closed ? n - 1 : n;
    const index = (i: number) =>
        closed
            ? ((i % ring) + ring) % ring
            : Math.max(0, Math.min(ring - 1, i));
    const x = (i: number) => points[index(i) * 2];
    const y = (i: number) => points[index(i) * 2 + 1];
    let d = `M${f(points[0])} ${f(points[1])}`;
    for (let i = 0; i < n - 1; i++) {
        const c1x = x(i) + (x(i + 1) - x(i - 1)) / 6;
        const c1y = y(i) + (y(i + 1) - y(i - 1)) / 6;
        const c2x = x(i + 1) - (x(i + 2) - x(i)) / 6;
        const c2y = y(i + 1) - (y(i + 2) - y(i)) / 6;
        d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(x(i + 1))} ${f(y(i + 1))}`;
    }
    return d;
}

export type PreviewPath = { color: string; d: string };

export function previewPaths(
    strokes: StrokeSpec[],
    spline: boolean,
    penColor: string,
    pointBudget = Infinity
): PreviewPath[] {
    const byColour = new Map<string, string[]>();
    let used = 0;
    for (const stroke of strokes) {
        used += stroke.points.length / 2;
        if (used > pointBudget) break;
        const color = stroke.color ?? penColor;
        const d = spline
            ? splinePath(stroke.points)
            : polylinePath(stroke.points);
        const list = byColour.get(color);
        if (list) list.push(d);
        else byColour.set(color, [d]);
    }
    return [...byColour].map(([color, parts]) => ({
        color,
        d: parts.join(""),
    }));
}
