import type { Rgba } from "./raster";

const SAMPLE_TARGET = 65_536;
export const PHOTO_COLOUR_BINS = 32;
export const PHOTO_TONE_BINS = 8;

export type PhotoStats = { colourBins: number; toneBins: number };

/**
 * colourBins: how many 4-bit-per-channel colours cover 90% of the opaque pixels.
 * toneBins: how many of 32 lightness steps hold at least 1% of them.
 */
export function photoStats(rgba: Rgba, w: number, h: number): PhotoStats {
    const colours = new Uint32Array(4096);
    const tones = new Uint32Array(32);
    const step = Math.max(1, Math.floor((w * h) / SAMPLE_TARGET));
    let n = 0;
    for (let i = 0; i < w * h; i += step) {
        const p = i * 4;
        if (rgba[p + 3] < 128) continue;
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];
        colours[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)]++;
        tones[Math.floor(0.2126 * r + 0.7152 * g + 0.0722 * b) >> 3]++;
        n++;
    }
    if (n === 0) return { colourBins: 0, toneBins: 0 };
    const counts = Array.from(colours)
        .filter((c) => c > 0)
        .sort((a, b) => b - a);
    let colourBins = 0;
    let covered = 0;
    for (const count of counts) {
        colourBins++;
        covered += count;
        if (covered >= 0.9 * n) break;
    }
    let toneBins = 0;
    for (const count of tones) if (count >= 0.01 * n) toneBins++;
    return { colourBins, toneBins };
}

// Logos, scans and screenshots sit on a few flat colours; a photo needs dozens of colours
// for most of its pixels and spreads across the tones.
export function looksLikePhoto(rgba: Rgba, w: number, h: number): boolean {
    const { colourBins, toneBins } = photoStats(rgba, w, h);
    return colourBins >= PHOTO_COLOUR_BINS && toneBins >= PHOTO_TONE_BINS;
}
