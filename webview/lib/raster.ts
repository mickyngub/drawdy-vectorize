export type Rgba = Uint8ClampedArray | Uint8Array;

export function luminance(rgba: Rgba, w: number, h: number): Uint8Array {
    const gray = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
        const a = rgba[p + 3] / 255;
        const y =
            0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2];
        gray[i] = Math.round(y * a + 255 * (1 - a));
    }
    return gray;
}

export function histogram(gray: Uint8Array): Uint32Array {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    return hist;
}

// Returns t such that gray < t is one class and gray >= t the other.
export function otsu(hist: ArrayLike<number>): number {
    let total = 0;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
        total += hist[i];
        sum += i * hist[i];
    }
    if (total === 0) return 128;
    let weightLow = 0;
    let sumLow = 0;
    let best = -1;
    let first = 0;
    let last = 0;
    for (let k = 0; k < 255; k++) {
        weightLow += hist[k];
        if (weightLow === 0) continue;
        const weightHigh = total - weightLow;
        if (weightHigh === 0) break;
        sumLow += k * hist[k];
        const meanLow = sumLow / weightLow;
        const meanHigh = (sum - sumLow) / weightHigh;
        const between = weightLow * weightHigh * (meanLow - meanHigh) ** 2;
        if (between > best) {
            best = between;
            first = k;
            last = k;
        } else if (between === best) {
            last = k;
        }
    }
    // A flat run of equal scores (an empty gap between the two peaks) is split in the middle.
    return Math.round((first + last) / 2) + 1;
}

export function binarize(
    gray: Uint8Array,
    threshold: number,
    invert: boolean
): Uint8Array {
    const mask = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) {
        mask[i] = (invert ? gray[i] >= threshold : gray[i] < threshold) ? 1 : 0;
    }
    return mask;
}

// Positive inside the ink, negative outside; marching squares interpolates the zero crossing.
export function inkField(
    gray: Uint8Array,
    threshold: number,
    invert: boolean
): Float32Array {
    const field = new Float32Array(gray.length);
    for (let i = 0; i < gray.length; i++) {
        field[i] = invert
            ? gray[i] - threshold + 0.5
            : threshold - gray[i] - 0.5;
    }
    return field;
}

export function borderIsDark(
    gray: Uint8Array,
    w: number,
    h: number,
    threshold: number
): boolean {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < w; x++) {
        sum += gray[x] + gray[(h - 1) * w + x];
        count += 2;
    }
    for (let y = 1; y < h - 1; y++) {
        sum += gray[y * w] + gray[y * w + w - 1];
        count += 2;
    }
    return count > 0 && sum / count < threshold;
}

export function countOn(mask: Uint8Array): number {
    let n = 0;
    for (let i = 0; i < mask.length; i++) n += mask[i];
    return n;
}

export function removeSpecks(
    mask: Uint8Array,
    w: number,
    h: number,
    minArea: number,
    diagonal = true
): Uint8Array {
    const out = mask.slice();
    if (minArea <= 1) return out;
    const seen = new Uint8Array(mask.length);
    const stack = new Int32Array(mask.length);
    const members: number[] = [];
    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || seen[start]) continue;
        members.length = 0;
        let top = 0;
        stack[top++] = start;
        seen[start] = 1;
        while (top > 0) {
            const i = stack[--top];
            members.push(i);
            const x = i % w;
            const y = (i - x) / w;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= h) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= w) continue;
                    if (!diagonal && dx !== 0 && dy !== 0) continue;
                    const j = ny * w + nx;
                    if (!mask[j] || seen[j]) continue;
                    seen[j] = 1;
                    stack[top++] = j;
                }
            }
        }
        if (members.length < minArea) {
            for (const i of members) out[i] = 0;
        }
    }
    return out;
}

// Closes pinholes: background regions smaller than minArea become ink. Background counts as
// connected only side to side, the counterpart of ink touching at corners.
export function fillHoles(
    mask: Uint8Array,
    w: number,
    h: number,
    minArea: number
): Uint8Array {
    const background = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) background[i] = mask[i] ? 0 : 1;
    const kept = removeSpecks(background, w, h, minArea, false);
    const out = mask.slice();
    for (let i = 0; i < mask.length; i++) {
        if (background[i] && !kept[i]) out[i] = 1;
    }
    return out;
}
