function segmentDistance(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(
        0,
        Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)
    );
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function keepMask(points: number[], tolerance: number): Uint8Array {
    const n = points.length / 2;
    const keep = new Uint8Array(n);
    if (n === 0) return keep;
    keep[0] = 1;
    keep[n - 1] = 1;
    const stack: number[] = [0, n - 1];
    while (stack.length) {
        const last = stack.pop()!;
        const first = stack.pop()!;
        let worst = -1;
        let worstAt = -1;
        const ax = points[first * 2];
        const ay = points[first * 2 + 1];
        const bx = points[last * 2];
        const by = points[last * 2 + 1];
        for (let i = first + 1; i < last; i++) {
            const d = segmentDistance(
                points[i * 2],
                points[i * 2 + 1],
                ax,
                ay,
                bx,
                by
            );
            if (d > worst) {
                worst = d;
                worstAt = i;
            }
        }
        if (worstAt >= 0 && worst > tolerance) {
            keep[worstAt] = 1;
            stack.push(first, worstAt, worstAt, last);
        }
    }
    return keep;
}

function pick(points: number[], keep: Uint8Array): number[] {
    const out: number[] = [];
    for (let i = 0; i < keep.length; i++) {
        if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
    }
    return out;
}

export function rdp(points: number[], tolerance: number): number[] {
    if (points.length <= 4) return points.slice();
    return pick(points, keepMask(points, tolerance));
}

// A closed ring is split at the point farthest from its start, each half is simplified on its own,
// and the start point is dropped again if it turns out to sit on a straight run.
export function rdpClosed(points: number[], tolerance: number): number[] {
    const n = points.length / 2;
    if (n <= 3) return points.slice();
    let far = 0;
    let farDistance = -1;
    for (let i = 1; i < n; i++) {
        const d = Math.hypot(
            points[i * 2] - points[0],
            points[i * 2 + 1] - points[1]
        );
        if (d > farDistance) {
            farDistance = d;
            far = i;
        }
    }
    const firstHalf = rdp(points.slice(0, far * 2 + 2), tolerance);
    const secondHalf = rdp(
        points.slice(far * 2).concat(points.slice(0, 2)),
        tolerance
    );
    const ring = firstHalf.concat(secondHalf.slice(2, -2));
    const m = ring.length / 2;
    if (m > 3) {
        const d = segmentDistance(
            ring[0],
            ring[1],
            ring[(m - 1) * 2],
            ring[(m - 1) * 2 + 1],
            ring[2],
            ring[3]
        );
        if (d <= tolerance) return ring.slice(2);
    }
    return ring;
}

export function closeRing(points: number[]): number[] {
    return points.concat(points.slice(0, 2));
}

export function polylineLength(points: number[]): number {
    let total = 0;
    for (let i = 2; i + 1 < points.length; i += 2) {
        total += Math.hypot(
            points[i] - points[i - 2],
            points[i + 1] - points[i - 1]
        );
    }
    return total;
}

// Moving average over the neighbours within `radius`, keeping both ends fixed; flattens pixel staircases.
export function smoothPolyline(points: number[], radius: number): number[] {
    const n = points.length / 2;
    if (n < 3 || radius < 1) return points.slice();
    const out = points.slice();
    for (let i = 1; i < n - 1; i++) {
        const r = Math.min(radius, i, n - 1 - i);
        let sx = 0;
        let sy = 0;
        for (let k = i - r; k <= i + r; k++) {
            sx += points[k * 2];
            sy += points[k * 2 + 1];
        }
        out[i * 2] = sx / (2 * r + 1);
        out[i * 2 + 1] = sy / (2 * r + 1);
    }
    return out;
}

// The board draws `spline` strokes as a uniform Catmull-Rom curve, which bulges wherever a long
// segment meets a short one. Dropping near-duplicate points and splitting long segments keeps the
// curve on the traced line.
export function prepareSpline(
    points: number[],
    maxSegment: number,
    minGap: number
): number[] {
    const n = points.length / 2;
    if (n < 3) return points.slice();
    const kept: number[] = [points[0], points[1]];
    for (let i = 1; i < n - 1; i++) {
        const x = points[i * 2];
        const y = points[i * 2 + 1];
        const px = kept[kept.length - 2];
        const py = kept[kept.length - 1];
        if (Math.hypot(x - px, y - py) >= minGap) kept.push(x, y);
    }
    const lx = points[n * 2 - 2];
    const ly = points[n * 2 - 1];
    if (
        kept.length > 2 &&
        Math.hypot(lx - kept[kept.length - 2], ly - kept[kept.length - 1]) <
            minGap
    ) {
        kept.length -= 2;
    }
    kept.push(lx, ly);
    const out: number[] = [kept[0], kept[1]];
    for (let i = 2; i < kept.length; i += 2) {
        const ax = kept[i - 2];
        const ay = kept[i - 1];
        const bx = kept[i];
        const by = kept[i + 1];
        const pieces = Math.ceil(Math.hypot(bx - ax, by - ay) / maxSegment);
        for (let k = 1; k < pieces; k++) {
            out.push(
                ax + ((bx - ax) * k) / pieces,
                ay + ((by - ay) * k) / pieces
            );
        }
        out.push(bx, by);
    }
    return out;
}
