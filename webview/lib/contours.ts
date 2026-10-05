export type Contour = {
    // Flat [x0, y0, x1, y1, ...] in pixel space (pixel x spans x..x+1), closed without repeating the first point.
    points: number[];
    area: number;
    hole: boolean;
};

export function polygonArea(points: number[]): number {
    let twice = 0;
    const n = points.length;
    for (let i = 0; i < n; i += 2) {
        const j = (i + 2) % n;
        twice += points[i] * points[j + 1] - points[j] * points[i + 1];
    }
    return twice / 2;
}

// Marching squares over the pixel centres. Diagonal foreground pixels count as touching, so a thin
// diagonal line stays one region. Every segment keeps the foreground on its left, which makes outer
// edges wind one way and holes the other.
export function traceContours(
    mask: Uint8Array,
    w: number,
    h: number,
    field?: Float32Array
): Contour[] {
    const W = w + 2;
    const H = h + 2;
    const pad = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            pad[(y + 1) * W + x + 1] = mask[y * w + x];
        }
    }
    const next = new Int32Array(W * H * 2).fill(-1);
    const hKey = (i: number, j: number) => (j * W + i) * 2;
    const vKey = (i: number, j: number) => (j * W + i) * 2 + 1;
    const corners = [0, 0, 0, 0];
    const keys = [0, 0, 0, 0];

    for (let cy = 0; cy < H - 1; cy++) {
        for (let cx = 0; cx < W - 1; cx++) {
            const tl = pad[cy * W + cx];
            const tr = pad[cy * W + cx + 1];
            const br = pad[(cy + 1) * W + cx + 1];
            const bl = pad[(cy + 1) * W + cx];
            const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
            if (code === 0 || code === 15) continue;
            corners[0] = tl;
            corners[1] = tr;
            corners[2] = br;
            corners[3] = bl;
            keys[0] = hKey(cx, cy);
            keys[1] = vKey(cx + 1, cy);
            keys[2] = hKey(cx, cy + 1);
            keys[3] = vKey(cx, cy);
            for (let k = 0; k < 4; k++) {
                // Clockwise edge k runs from corner k to corner k+1; entering ink pairs with the exit before it.
                if (corners[k] !== 0 || corners[(k + 1) & 3] !== 1) continue;
                for (let back = 1; back < 4; back++) {
                    const a = (k - back + 4) & 3;
                    if (corners[a] === 1 && corners[(a + 1) & 3] === 0) {
                        next[keys[k]] = keys[a];
                        break;
                    }
                }
            }
        }
    }

    const fieldAt = (i: number, j: number): number | null => {
        if (!field || i < 1 || j < 1 || i > w || j > h) return null;
        return field[(j - 1) * w + (i - 1)];
    };
    const along = (a: number | null, b: number | null): number => {
        if (a === null || b === null || a > 0 === b > 0) return 0.5;
        return Math.min(1, Math.max(0, a / (a - b)));
    };
    const pointOf = (key: number, out: number[]) => {
        const cell = key >> 1;
        const i = cell % W;
        const j = (cell - i) / W;
        if (key & 1) {
            const t = along(fieldAt(i, j), fieldAt(i, j + 1));
            out.push(i - 0.5, j - 0.5 + t);
        } else {
            const t = along(fieldAt(i, j), fieldAt(i + 1, j));
            out.push(i - 0.5 + t, j - 0.5);
        }
    };

    const contours: Contour[] = [];
    for (let start = 0; start < next.length; start++) {
        if (next[start] < 0) continue;
        const points: number[] = [];
        let key = start;
        while (key >= 0 && next[key] >= 0) {
            pointOf(key, points);
            const following = next[key];
            next[key] = -1;
            key = following;
        }
        if (points.length < 6) continue;
        const area = polygonArea(points);
        contours.push({ points, area: Math.abs(area), hole: area > 0 });
    }
    return contours;
}

export function contourBounds(points: number[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
} {
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
    return { minX, minY, maxX, maxY };
}
