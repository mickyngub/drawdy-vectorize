import assert from "node:assert/strict";
import { test } from "node:test";
import { contourBounds, traceContours } from "../webview/lib/contours";
import { maskFrom, ring } from "./helpers";

test("marching squares on a ring gives one outer edge and one hole", () => {
    const mask = maskFrom(64, 64, ring(32, 32, 10, 20));
    const contours = traceContours(mask, 64, 64);
    assert.equal(contours.length, 2);
    const outer = contours.find((c) => !c.hole)!;
    const hole = contours.find((c) => c.hole)!;
    assert.ok(outer && hole);

    const o = contourBounds(outer.points);
    for (const v of [o.minX, o.minY])
        assert.ok(Math.abs(v - 12) <= 1, `outer min ${v}`);
    for (const v of [o.maxX, o.maxY])
        assert.ok(Math.abs(v - 52) <= 1, `outer max ${v}`);
    const i = contourBounds(hole.points);
    for (const v of [i.minX, i.minY])
        assert.ok(Math.abs(v - 22) <= 1, `hole min ${v}`);
    for (const v of [i.maxX, i.maxY])
        assert.ok(Math.abs(v - 42) <= 1, `hole max ${v}`);

    const ringArea = Math.PI * (20 ** 2 - 10 ** 2);
    assert.ok(Math.abs(outer.area - hole.area - ringArea) / ringArea < 0.05);
});

test("a square touching the image edge still closes", () => {
    const mask = maskFrom(10, 10, (x, y) => x < 4 && y < 4);
    const [square, ...rest] = traceContours(mask, 10, 10);
    assert.equal(rest.length, 0);
    assert.equal(square.hole, false);
    assert.deepEqual(contourBounds(square.points), {
        minX: 0,
        minY: 0,
        maxX: 4,
        maxY: 4,
    });
});

test("diagonal pixels join into one region", () => {
    const mask = maskFrom(6, 6, (x, y) => x === y);
    assert.equal(traceContours(mask, 6, 6).length, 1);
});

test("the ink field moves the edge to the threshold crossing", () => {
    const w = 8;
    const h = 4;
    const mask = maskFrom(w, h, (x) => x < 4);
    const field = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) field[y * w + x] = x < 4 ? 30 : -10;
    }
    const [shape] = traceContours(mask, w, h, field);
    const b = contourBounds(shape.points);
    assert.ok(Math.abs(b.maxX - 4.25) < 1e-6, `right edge ${b.maxX}`);
});
