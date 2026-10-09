import assert from "node:assert/strict";
import { test } from "node:test";
import { mulberry32 } from "../webview/lib/kmeans";
import { looksLikePhoto, photoStats } from "../webview/lib/photo";
import { rgbaFrom, ring } from "./helpers";

const W = 240;
const H = 160;

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

test("a flat logo on white is not a photo", () => {
    const inRing = ring(60, 80, 25, 50);
    const rgba = rgbaFrom(W, H, (x, y) => {
        if (inRing(x, y)) return [225, 29, 72];
        if (x >= 130 && x < 230 && y >= 60 && y < 100) return [15, 23, 42];
        if (x >= 130 && x < 230 && y >= 120 && y < 130) return [245, 158, 11];
        return [255, 255, 255];
    });
    assert.equal(looksLikePhoto(rgba, W, H), false);
});

test("a pencil sketch on grainy paper is not a photo", () => {
    const random = mulberry32(7);
    const rgba = rgbaFrom(W, H, (x, y) => {
        const line = y === 40 || y === 41 || Math.abs(x - y) < 2;
        const grain = (random() - 0.5) * 14;
        return line
            ? [40 + grain, 40 + grain, 40 + grain]
            : [clamp(238 + grain), clamp(234 + grain), clamp(224 + grain)];
    });
    assert.equal(looksLikePhoto(rgba, W, H), false);
});

test("a photo with gradients, colour and noise is a photo", () => {
    const random = mulberry32(11);
    const rgba = rgbaFrom(W, H, (x, y) => {
        const noise = (random() - 0.5) * 20;
        return [
            clamp((x / W) * 255 + noise),
            clamp((y / H) * 200 + 30 + noise),
            clamp(((x + y) / (W + H)) * 180 + 40 - noise),
        ];
    });
    const stats = photoStats(rgba, W, H);
    assert.ok(stats.colourBins >= 32, `colour bins ${stats.colourBins}`);
    assert.equal(looksLikePhoto(rgba, W, H), true);
});

test("transparent pixels are ignored", () => {
    const random = mulberry32(3);
    const rgba = rgbaFrom(W, H, () => [
        random() * 255,
        random() * 255,
        random() * 255,
        0,
    ]);
    assert.deepEqual(photoStats(rgba, W, H), { colourBins: 0, toneBins: 0 });
    assert.equal(looksLikePhoto(rgba, W, H), false);
});
