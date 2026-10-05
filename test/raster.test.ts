import assert from "node:assert/strict";
import { test } from "node:test";
import {
    binarize,
    borderIsDark,
    fillHoles,
    histogram,
    inkField,
    luminance,
    otsu,
    removeSpecks,
} from "../webview/lib/raster";
import { maskFrom, rgbaFrom } from "./helpers";

test("Otsu splits a bimodal histogram between its two peaks", () => {
    const hist = new Array(256).fill(0);
    for (let v = 40; v <= 60; v++) hist[v] = 100;
    for (let v = 190; v <= 210; v++) hist[v] = 300;
    const t = otsu(hist);
    assert.ok(t > 60 && t <= 190, `threshold ${t}`);
    assert.equal(t, 126);
});

test("Otsu on real pixels puts the dark shape below the threshold", () => {
    const rgba = rgbaFrom(20, 20, (x) =>
        x < 8 ? [30, 30, 30] : [235, 235, 235]
    );
    const gray = luminance(rgba, 20, 20);
    const t = otsu(histogram(gray));
    const mask = binarize(gray, t, false);
    assert.equal(
        mask.reduce((a, b) => a + b, 0),
        8 * 20
    );
    assert.equal(
        binarize(gray, t, true).reduce((a, b) => a + b, 0),
        12 * 20
    );
});

test("luminance composites transparent pixels onto white", () => {
    const rgba = rgbaFrom(2, 1, (x) =>
        x === 0 ? [0, 0, 0, 0] : [0, 0, 0, 255]
    );
    assert.deepEqual([...luminance(rgba, 2, 1)], [255, 0]);
});

test("the ink field is positive exactly where the mask is on", () => {
    const gray = Uint8Array.from([0, 99, 100, 101, 255]);
    for (const invert of [false, true]) {
        const mask = binarize(gray, 100, invert);
        const field = inkField(gray, 100, invert);
        for (let i = 0; i < gray.length; i++) {
            assert.equal(field[i] > 0, mask[i] === 1);
        }
    }
});

test("a dark border means light lines on dark", () => {
    const dark = new Uint8Array(100).fill(20);
    const light = new Uint8Array(100).fill(240);
    assert.equal(borderIsDark(dark, 10, 10, 128), true);
    assert.equal(borderIsDark(light, 10, 10, 128), false);
});

test("removeSpecks drops regions under the area and keeps the rest", () => {
    const mask = maskFrom(
        20,
        10,
        (x, y) =>
            (x < 6 && y < 6) || (x === 15 && y === 5) || (x >= 17 && y >= 8)
    );
    const out = removeSpecks(mask, 20, 10, 5);
    assert.equal(
        out.reduce((a, b) => a + b, 0),
        36 + 6
    );
    assert.equal(out[5 * 20 + 15], 0);
    assert.equal(out[0], 1);
});

test("fillHoles closes pinholes, even one that touches the outside only at a corner", () => {
    const mask = maskFrom(
        12,
        12,
        (x, y) => x >= 2 && x < 10 && y >= 2 && y < 10
    );
    mask[5 * 12 + 5] = 0;
    mask[2 * 12 + 2] = 0;
    mask[3 * 12 + 3] = 0;
    const out = fillHoles(mask, 12, 12, 4);
    assert.equal(out[5 * 12 + 5], 1);
    assert.equal(
        out[3 * 12 + 3],
        1,
        "joined to the outside only diagonally, so still a hole"
    );
    assert.equal(out[2 * 12 + 2], 0, "a notch in the edge stays open");
    assert.equal(out[0], 0);
});

test("fillHoles keeps holes at or above the area", () => {
    const mask = maskFrom(
        20,
        20,
        (x, y) => !(x >= 6 && x < 10 && y >= 6 && y < 10)
    );
    assert.equal(
        fillHoles(mask, 20, 20, 16).reduce((a, b) => a + b, 0),
        400 - 16
    );
    assert.equal(
        fillHoles(mask, 20, 20, 17).reduce((a, b) => a + b, 0),
        400
    );
});
