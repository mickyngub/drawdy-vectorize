import type { Rgba } from "./raster";

const toLinear = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function srgbToOklab(
    r: number,
    g: number,
    b: number
): [number, number, number] {
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    const l = Math.cbrt(
        0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
    );
    const m = Math.cbrt(
        0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
    );
    const s = Math.cbrt(
        0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
    );
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const hex2 = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0");

export const toHex = (r: number, g: number, b: number): string =>
    `#${hex2(r)}${hex2(g)}${hex2(b)}`;

const RESTARTS = 4;

const dist2 = (
    lab: Float64Array,
    i: number,
    c: Float64Array,
    j: number
): number =>
    (lab[i * 3] - c[j * 3]) ** 2 +
    (lab[i * 3 + 1] - c[j * 3 + 1]) ** 2 +
    (lab[i * 3 + 2] - c[j * 3 + 2]) ** 2;

// Greedy k-means++: each new centre is the best of a few weighted draws, which keeps small but
// distinct colours from losing their cluster to anti-aliased edge pixels.
function seedCenters(
    lab: Float64Array,
    weight: Float64Array,
    clusters: number,
    random: () => number
): Float64Array {
    const m = weight.length;
    const centers = new Float64Array(clusters * 3);
    const nearest = new Float64Array(m).fill(Infinity);
    const trials = 2 + Math.floor(Math.log(clusters));
    const draw = (scores: Float64Array, total: number): number => {
        let target = random() * total;
        for (let i = 0; i < m; i++) {
            target -= scores[i];
            if (target <= 0 && scores[i] > 0) return i;
        }
        return m - 1;
    };
    const scores = new Float64Array(m);
    const candidate = new Float64Array(3);
    for (let c = 0; c < clusters; c++) {
        let total = 0;
        for (let i = 0; i < m; i++) {
            scores[i] = c === 0 ? weight[i] : weight[i] * nearest[i];
            total += scores[i];
        }
        let best = -1;
        let bestCost = Infinity;
        for (let t = 0; t < (c === 0 ? 1 : trials); t++) {
            const pick = total > 0 ? draw(scores, total) : t % m;
            candidate[0] = lab[pick * 3];
            candidate[1] = lab[pick * 3 + 1];
            candidate[2] = lab[pick * 3 + 2];
            let cost = 0;
            for (let i = 0; i < m; i++) {
                cost +=
                    weight[i] *
                    Math.min(nearest[i], dist2(lab, i, candidate, 0));
            }
            if (cost < bestCost) {
                bestCost = cost;
                best = pick;
            }
        }
        centers[c * 3] = lab[best * 3];
        centers[c * 3 + 1] = lab[best * 3 + 1];
        centers[c * 3 + 2] = lab[best * 3 + 2];
        for (let i = 0; i < m; i++) {
            nearest[i] = Math.min(nearest[i], dist2(lab, i, centers, c));
        }
    }
    return centers;
}

function lloyd(
    lab: Float64Array,
    weight: Float64Array,
    centers: Float64Array
): { assign: Int32Array; inertia: number } {
    const m = weight.length;
    const clusters = centers.length / 3;
    const assign = new Int32Array(m).fill(-1);
    const sums = new Float64Array(clusters * 4);
    let inertia = 0;
    for (let iteration = 0; iteration < 30; iteration++) {
        let moved = false;
        inertia = 0;
        for (let i = 0; i < m; i++) {
            let best = 0;
            let bestD = Infinity;
            for (let c = 0; c < clusters; c++) {
                const d = dist2(lab, i, centers, c);
                if (d < bestD) {
                    bestD = d;
                    best = c;
                }
            }
            inertia += weight[i] * bestD;
            if (assign[i] !== best) moved = true;
            assign[i] = best;
        }
        if (!moved) break;
        sums.fill(0);
        for (let i = 0; i < m; i++) {
            const c = assign[i];
            sums[c * 4] += lab[i * 3] * weight[i];
            sums[c * 4 + 1] += lab[i * 3 + 1] * weight[i];
            sums[c * 4 + 2] += lab[i * 3 + 2] * weight[i];
            sums[c * 4 + 3] += weight[i];
        }
        for (let c = 0; c < clusters; c++) {
            const total = sums[c * 4 + 3];
            if (total === 0) continue;
            centers[c * 3] = sums[c * 4] / total;
            centers[c * 3 + 1] = sums[c * 4 + 1] / total;
            centers[c * 3 + 2] = sums[c * 4 + 2] / total;
        }
    }
    return { assign, inertia };
}

export type Clusters = {
    // Cluster index per pixel, or -1 for a transparent pixel.
    labels: Int16Array;
    colors: string[];
    counts: number[];
};

const BITS = 5;
const LEVELS = 1 << BITS;
const binOf = (r: number, g: number, b: number): number =>
    ((r >> (8 - BITS)) << (2 * BITS)) |
    ((g >> (8 - BITS)) << BITS) |
    (b >> (8 - BITS));

// Pixels are binned to 15-bit colour first, so the k-means runs over at most 32,768 weighted points
// whatever the image size, and one lookup labels every pixel afterwards.
export function clusterColours(
    rgba: Rgba,
    w: number,
    h: number,
    k: number,
    seed = 1
): Clusters {
    const n = w * h;
    const binCount = new Float64Array(LEVELS ** 3);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
        if (rgba[p + 3] < 128) continue;
        binCount[binOf(rgba[p], rgba[p + 1], rgba[p + 2])]++;
    }
    const bins: number[] = [];
    for (let i = 0; i < binCount.length; i++) if (binCount[i] > 0) bins.push(i);
    const m = bins.length;
    const lab = new Float64Array(m * 3);
    const weight = new Float64Array(m);
    const half = 1 << (7 - BITS);
    bins.forEach((bin, i) => {
        const r = ((bin >> (2 * BITS)) << (8 - BITS)) + half;
        const g = (((bin >> BITS) & (LEVELS - 1)) << (8 - BITS)) + half;
        const b = ((bin & (LEVELS - 1)) << (8 - BITS)) + half;
        const [L, A, B] = srgbToOklab(r, g, b);
        lab[i * 3] = L;
        lab[i * 3 + 1] = A;
        lab[i * 3 + 2] = B;
        weight[i] = binCount[bin];
    });

    const clusters = Math.max(1, Math.min(k, m));
    const random = mulberry32(seed);
    let assign: Int32Array = new Int32Array(m);
    let bestInertia = Infinity;
    for (let restart = 0; restart < RESTARTS && m > 0; restart++) {
        const run = lloyd(
            lab,
            weight,
            seedCenters(lab, weight, clusters, random)
        );
        if (run.inertia < bestInertia) {
            bestInertia = run.inertia;
            assign = run.assign;
        }
    }

    const lookup = new Int16Array(binCount.length).fill(-1);
    bins.forEach((bin, i) => {
        lookup[bin] = assign[i];
    });
    const raw = new Int16Array(n);
    const rgbSums = new Float64Array(clusters * 3);
    const rawCounts = new Array<number>(clusters).fill(0);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
        if (rgba[p + 3] < 128) {
            raw[i] = -1;
            continue;
        }
        const c = lookup[binOf(rgba[p], rgba[p + 1], rgba[p + 2])];
        raw[i] = c;
        rgbSums[c * 3] += rgba[p];
        rgbSums[c * 3 + 1] += rgba[p + 1];
        rgbSums[c * 3 + 2] += rgba[p + 2];
        rawCounts[c]++;
    }

    // Empty clusters are dropped and the rest renumbered from the largest down, so the order is stable.
    const order = rawCounts
        .map((count, c) => ({ count, c }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count || a.c - b.c);
    const renumber = new Int16Array(clusters).fill(-1);
    order.forEach((entry, index) => {
        renumber[entry.c] = index;
    });
    const labels = new Int16Array(n);
    for (let i = 0; i < n; i++) labels[i] = raw[i] < 0 ? -1 : renumber[raw[i]];
    return {
        labels,
        colors: order.map(({ c, count }) =>
            toHex(
                rgbSums[c * 3] / count,
                rgbSums[c * 3 + 1] / count,
                rgbSums[c * 3 + 2] / count
            )
        ),
        counts: order.map((entry) => entry.count),
    };
}

export function backgroundCluster(
    labels: Int16Array,
    w: number,
    h: number,
    counts: number[]
): number {
    const touches = new Set<number>();
    for (let x = 0; x < w; x++) {
        touches.add(labels[x]);
        touches.add(labels[(h - 1) * w + x]);
    }
    for (let y = 0; y < h; y++) {
        touches.add(labels[y * w]);
        touches.add(labels[y * w + w - 1]);
    }
    let best = -1;
    for (const c of touches) {
        if (c < 0) continue;
        if (best < 0 || counts[c] > counts[best]) best = c;
    }
    return best;
}

export function clusterMask(labels: Int16Array, cluster: number): Uint8Array {
    const mask = new Uint8Array(labels.length);
    for (let i = 0; i < labels.length; i++)
        mask[i] = labels[i] === cluster ? 1 : 0;
    return mask;
}
