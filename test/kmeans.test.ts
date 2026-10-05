import assert from "node:assert/strict";
import { test } from "node:test";
import {
    backgroundCluster,
    clusterColours,
    clusterMask,
    srgbToOklab,
} from "../webview/lib/kmeans";
import { rgbaFrom } from "./helpers";

const threeColours = () =>
    rgbaFrom(60, 30, (x, y) => {
        if (x >= 10 && x < 25 && y >= 8 && y < 22) return [220, 30, 40];
        if (x >= 35 && x < 50 && y >= 8 && y < 22) return [30, 90, 220];
        return [250, 250, 245];
    });

test("OKLab puts white at L 1 and black at L 0", () => {
    const [L, a, b] = srgbToOklab(255, 255, 255);
    assert.ok(
        Math.abs(L - 1) < 1e-3 && Math.abs(a) < 1e-3 && Math.abs(b) < 1e-3
    );
    assert.ok(Math.abs(srgbToOklab(0, 0, 0)[0]) < 1e-9);
});

test("k-means separates a three-colour image into its three colours", () => {
    const rgba = threeColours();
    const { labels, colors, counts } = clusterColours(rgba, 60, 30, 3);
    assert.equal(colors.length, 3);
    assert.deepEqual(counts, [60 * 30 - 2 * 15 * 14, 15 * 14, 15 * 14]);
    assert.equal(colors[0], "#fafaf5");
    assert.deepEqual([...colors.slice(1)].sort(), ["#1e5adc", "#dc1e28"]);
    const red = labels[10 * 60 + 12];
    const blue = labels[10 * 60 + 40];
    assert.notEqual(red, blue);
    assert.equal(colors[red], "#dc1e28");
    for (let y = 8; y < 22; y++) {
        for (let x = 10; x < 25; x++) assert.equal(labels[y * 60 + x], red);
    }
    assert.equal(
        clusterMask(labels, blue).reduce((a, b) => a + b, 0),
        210
    );
});

test("k-means is deterministic", () => {
    const rgba = rgbaFrom(64, 64, (x, y) => [
        (x * 37 + y * 11) % 256,
        (x * 5 + y * 23) % 256,
        (x * y) % 256,
    ]);
    const first = clusterColours(rgba, 64, 64, 6);
    const second = clusterColours(rgba, 64, 64, 6);
    assert.deepEqual(first.colors, second.colors);
    assert.deepEqual([...first.labels], [...second.labels]);
    assert.equal(first.colors.length, 6);
});

test("the background is the largest cluster on the border", () => {
    const { labels, counts } = clusterColours(threeColours(), 60, 30, 3);
    assert.equal(backgroundCluster(labels, 60, 30, counts), 0);
});

test("transparent pixels belong to no cluster", () => {
    const rgba = rgbaFrom(4, 1, (x) => (x < 2 ? [0, 0, 0, 0] : [10, 200, 10]));
    const { labels, colors } = clusterColours(rgba, 4, 1, 3);
    assert.deepEqual([...labels], [-1, -1, 0, 0]);
    assert.deepEqual(colors, ["#0ac80a"]);
});

test("a small distinct colour keeps its own cluster next to anti-aliased edges", () => {
    const rgba = rgbaFrom(200, 120, (x, y) => {
        if (x >= 20 && x < 40 && y >= 70 && y < 90) return [200, 60, 50];
        if (y > 60) return [60, 140, 80];
        if (y === 60) return [120, 180, 160];
        if (x >= 150 && x < 180 && y >= 10 && y < 40) return [250, 200, 40];
        return [180, 220, 245];
    });
    const { colors } = clusterColours(rgba, 200, 120, 4);
    assert.ok(
        colors.includes("#c83c32"),
        `the red block is missing from ${colors.join(" ")}`
    );
    assert.ok(
        colors.includes("#fac828"),
        `the yellow block is missing from ${colors.join(" ")}`
    );
});
