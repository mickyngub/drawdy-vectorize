export function maskFrom(
    w: number,
    h: number,
    on: (x: number, y: number) => boolean
): Uint8Array {
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) mask[y * w + x] = on(x, y) ? 1 : 0;
    }
    return mask;
}

export function rgbaFrom(
    w: number,
    h: number,
    colour: (x: number, y: number) => [number, number, number, number?]
): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const [r, g, b, a = 255] = colour(x, y);
            const p = (y * w + x) * 4;
            rgba[p] = r;
            rgba[p + 1] = g;
            rgba[p + 2] = b;
            rgba[p + 3] = a;
        }
    }
    return rgba;
}

export const ring =
    (cx: number, cy: number, inner: number, outer: number) =>
    (x: number, y: number): boolean => {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        return d >= inner && d <= outer;
    };
