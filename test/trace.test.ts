import assert from "node:assert/strict";
import { test } from "node:test";
import { previewPaths, splinePath } from "../webview/lib/paths";
import {
    DEFAULTS,
    TraceCache,
    traceImage,
    type Params,
} from "../webview/lib/trace";
import { rgbaFrom, ring } from "./helpers";

const run = (
    rgba: Uint8ClampedArray,
    w: number,
    h: number,
    params: Partial<Params>
) =>
    traceImage(
        { id: "test", rgba, w, h },
        { ...DEFAULTS, ...params },
        new TraceCache(),
        () => false,
        async () => {}
    );

const ringImage = () => {
    const inRing = ring(50, 50, 18, 30);
    return rgbaFrom(140, 100, (x, y) =>
        inRing(x, y) || (x >= 95 && x < 125 && y >= 20 && y < 80)
            ? [20, 20, 20]
            : [255, 255, 255]
    );
};

test("Outline traces a ring and a block into three closed strokes", async () => {
    const result = (await run(ringImage(), 140, 100, {
        mode: "outline",
        threshold: 128,
        smooth: false,
    }))!;
    assert.equal(result.strokes.length, 3);
    for (const stroke of result.strokes) {
        const p = stroke.points;
        assert.deepEqual(p.slice(0, 2), p.slice(-2), "closed");
        assert.equal(stroke.color, null);
    }
    assert.deepEqual(result.strokeWidth, { unit: "pen" });
    assert.equal(result.empty, null);
    const block = result.strokes.find((s) => s.points.length / 2 === 5)!;
    assert.ok(block, "the block simplifies to its four corners");
    const smooth = (await run(ringImage(), 140, 100, {
        mode: "outline",
        threshold: 128,
    }))!;
    assert.equal(smooth.strokes.length, 3);
    assert.ok(
        smooth.points > result.points,
        "Smooth splits long sides for the board's spline"
    );
});

test("Outline honours Ignore specks, Invert and colour choices", async () => {
    const img = rgbaFrom(60, 40, (x, y) =>
        (x >= 5 && x < 25 && y >= 5 && y < 35) || (x === 40 && y === 20)
            ? [200, 30, 30]
            : [255, 255, 255]
    );
    const fromImage = (await run(img, 60, 40, { specks: 4, colour: "image" }))!;
    assert.equal(fromImage.strokes.length, 1);
    assert.equal(fromImage.strokes[0].color, "#c81e1e");
    const custom = (await run(img, 60, 40, {
        specks: 0,
        colour: "custom",
        custom: "#00ff00",
    }))!;
    assert.equal(custom.strokes.length, 2);
    assert.ok(custom.strokes.every((s) => s.color === "#00ff00"));
    const inverted = (await run(img, 60, 40, { specks: 4, invert: true }))!;
    assert.equal(
        inverted.strokes.length,
        2,
        "the white field's outer edge and the shape as its hole"
    );
    const none = (await run(img, 60, 40, { threshold: 10 }))!;
    assert.equal(none.strokes.length, 0);
    assert.match(none.empty!, /Nothing to trace/);
});

test("Centerline traces a thick T into three open strokes with an auto width", async () => {
    const img = rgbaFrom(60, 50, (x, y) =>
        (y >= 5 && y < 11 && x >= 4 && x < 56) ||
        (x >= 27 && x < 33 && y >= 5 && y < 46)
            ? [0, 0, 0]
            : [255, 255, 255]
    );
    const result = (await run(img, 60, 50, { mode: "centerline", specks: 4 }))!;
    assert.equal(result.strokes.length, 3);
    assert.ok(
        result.thicknessPx! >= 5 && result.thicknessPx! <= 7,
        `thickness ${result.thicknessPx}`
    );
    assert.deepEqual(result.strokeWidth, {
        unit: "px",
        value: result.thicknessPx,
    });
    const fixed = (await run(img, 60, 50, {
        mode: "centerline",
        widthAuto: false,
        width: 3,
    }))!;
    assert.deepEqual(fixed.strokeWidth, { unit: "board", value: 3 });
});

test("Colour layers outline each colour in its own colour and drop the background", async () => {
    const img = rgbaFrom(60, 30, (x, y) => {
        if (x >= 10 && x < 25 && y >= 8 && y < 22) return [220, 30, 40];
        if (x >= 35 && x < 50 && y >= 8 && y < 22) return [30, 90, 220];
        return [250, 250, 245];
    });
    const dropped = (await run(img, 60, 30, { mode: "layers", colours: 3 }))!;
    assert.deepEqual(dropped.strokes.map((s) => s.color).sort(), [
        "#1e5adc",
        "#dc1e28",
    ]);
    const kept = (await run(img, 60, 30, {
        mode: "layers",
        colours: 3,
        dropBackground: false,
    }))!;
    assert.equal(
        kept.strokes.length,
        5,
        "background outer edge, its two holes, and the two blocks"
    );
});

test("a cancelled trace resolves to null", async () => {
    const result = await traceImage(
        { id: "c", rgba: ringImage(), w: 140, h: 100 },
        { ...DEFAULTS, mode: "centerline" },
        new TraceCache(),
        () => true,
        async () => {}
    );
    assert.equal(result, null);
});

test("the preview draws a spline through every point and groups by colour", () => {
    const d = splinePath([0, 0, 10, 0, 10, 10]);
    assert.equal((d.match(/C/g) ?? []).length, 2);
    assert.ok(d.endsWith("10 10"));
    const paths = previewPaths(
        [
            { points: [0, 0, 1, 1], color: null },
            { points: [2, 2, 3, 3], color: "#ff0000" },
            { points: [4, 4, 5, 5], color: null },
        ],
        false,
        "#111111"
    );
    assert.deepEqual(paths, [
        { color: "#111111", d: "M0 0L1 1M4 4L5 5" },
        { color: "#ff0000", d: "M2 2L3 3" },
    ]);
});
