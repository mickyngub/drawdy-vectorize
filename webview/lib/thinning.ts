// Zhang–Suen thinning with the Lü–Wang fix (a pixel needs three neighbours to go), which stops the
// original from erasing two-pixel diagonal lines. One pass per yield, so a caller can keep the page
// responsive. A last sequential sweep removes the simple points that fix leaves on diagonals.
export function* zhangSuenSteps(
    mask: Uint8Array,
    w: number,
    h: number
): Generator<number, Uint8Array> {
    const img = mask.slice();
    const at = (x: number, y: number): number =>
        x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x];
    let live: number[] = [];
    for (let i = 0; i < img.length; i++) if (img[i]) live.push(i);
    const remove: number[] = [];
    let pass = 0;
    let changed = true;
    while (changed) {
        changed = false;
        for (let step = 0; step < 2; step++) {
            remove.length = 0;
            for (const i of live) {
                if (!img[i]) continue;
                const x = i % w;
                const y = (i - x) / w;
                const p2 = at(x, y - 1);
                const p3 = at(x + 1, y - 1);
                const p4 = at(x + 1, y);
                const p5 = at(x + 1, y + 1);
                const p6 = at(x, y + 1);
                const p7 = at(x - 1, y + 1);
                const p8 = at(x - 1, y);
                const p9 = at(x - 1, y - 1);
                const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
                if (b < 3 || b > 6) continue;
                const a =
                    (p2 === 0 && p3 === 1 ? 1 : 0) +
                    (p3 === 0 && p4 === 1 ? 1 : 0) +
                    (p4 === 0 && p5 === 1 ? 1 : 0) +
                    (p5 === 0 && p6 === 1 ? 1 : 0) +
                    (p6 === 0 && p7 === 1 ? 1 : 0) +
                    (p7 === 0 && p8 === 1 ? 1 : 0) +
                    (p8 === 0 && p9 === 1 ? 1 : 0) +
                    (p9 === 0 && p2 === 1 ? 1 : 0);
                if (a !== 1) continue;
                if (step === 0) {
                    if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
                } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) {
                    continue;
                }
                remove.push(i);
            }
            for (const i of remove) img[i] = 0;
            if (remove.length) changed = true;
        }
        live = live.filter((i) => img[i] === 1);
        pass++;
        if (changed) yield pass;
    }
    for (const i of live) {
        const x = i % w;
        const y = (i - x) / w;
        const n = [
            at(x + 1, y),
            at(x + 1, y - 1),
            at(x, y - 1),
            at(x - 1, y - 1),
            at(x - 1, y),
            at(x - 1, y + 1),
            at(x, y + 1),
            at(x + 1, y + 1),
        ];
        let b = 0;
        for (const v of n) b += v;
        if (b < 3) continue;
        // Yokoi's 8-connectivity number: 1 means removing the pixel changes no connection.
        let yokoi = 0;
        for (let k = 0; k < 8; k += 2) {
            yokoi +=
                1 - n[k] - (1 - n[k]) * (1 - n[k + 1]) * (1 - n[(k + 2) & 7]);
        }
        if (yokoi === 1) img[i] = 0;
    }
    return img;
}

export function zhangSuen(mask: Uint8Array, w: number, h: number): Uint8Array {
    const steps = zhangSuenSteps(mask, w, h);
    for (;;) {
        const next = steps.next();
        if (next.done) return next.value;
    }
}

function edt1d(
    f: Float64Array,
    n: number,
    d: Float64Array,
    v: Int32Array,
    z: Float64Array
): void {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < n; q++) {
        let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) {
            k--;
            s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
}

// Exact Euclidean distance from each ink pixel to the nearest non-ink pixel; outside the image counts as non-ink.
export function distanceTransform(
    mask: Uint8Array,
    w: number,
    h: number
): Float32Array {
    const W = w + 2;
    const H = h + 2;
    const BIG = 1e12;
    const grid = new Float64Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const inside =
                x > 0 && y > 0 && x <= w && y <= h && mask[(y - 1) * w + x - 1];
            grid[y * W + x] = inside ? BIG : 0;
        }
    }
    const n = Math.max(W, H);
    const f = new Float64Array(n);
    const d = new Float64Array(n);
    const v = new Int32Array(n);
    const z = new Float64Array(n + 1);
    for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) f[y] = grid[y * W + x];
        edt1d(f, H, d, v, z);
        for (let y = 0; y < H; y++) grid[y * W + x] = d[y];
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) f[x] = grid[y * W + x];
        edt1d(f, W, d, v, z);
        for (let x = 0; x < W; x++) grid[y * W + x] = d[x];
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            out[y * w + x] = Math.sqrt(grid[(y + 1) * W + x + 1]);
        }
    }
    return out;
}

// A line t pixels thick puts its centre (t + 1) / 2 pixels from the nearest background pixel.
export function medianThickness(
    distance: Float32Array,
    skeleton: Uint8Array
): number {
    const samples: number[] = [];
    for (let i = 0; i < skeleton.length; i++) {
        if (skeleton[i]) samples.push(distance[i]);
    }
    if (!samples.length) return 1;
    samples.sort((a, b) => a - b);
    const median = samples[samples.length >> 1];
    return Math.max(1, 2 * median - 1);
}
