import assert from "node:assert/strict";
import { test } from "node:test";
import { PLACE_GAP } from "../src/lib/free-spot";
import {
    boardStrokeWidth,
    countPoints,
    isValidStroke,
    mapPoints,
    PLACE_WIDTH,
    preferredRect,
    strokeElements,
} from "../src/lib/placement";

test("a board image prefers the spot 40 units to its right at the same height", () => {
    const source = { x: 100, y: 50, width: 300, height: 200 };
    assert.deepEqual(preferredRect(1024, 683, source, null), {
        x: 100 + 300 + PLACE_GAP,
        y: 50,
        width: 200 / (683 / 1024),
        height: 200,
    });
});

test("an upload prefers the middle of the visible area at 480 wide", () => {
    const view = { x: -500, y: -300, width: 1000, height: 600 };
    const rect = preferredRect(1024, 512, null, view);
    assert.deepEqual(rect, {
        x: -240,
        y: -120,
        width: PLACE_WIDTH,
        height: 240,
    });
});

test("pixels map onto the target rect with one uniform scale", () => {
    const rect = { x: 10, y: 20, width: 512, height: 256 };
    assert.deepEqual(
        mapPoints([0, 0, 1024, 512, 512, 256.5], 1024, rect),
        [10, 20, 522, 276, 266, 148.25]
    );
});

test("stroke width follows the pen, scales measured pixels, or stays fixed", () => {
    assert.equal(boardStrokeWidth({ unit: "pen" }, 0.5, 3), 3);
    assert.equal(
        boardStrokeWidth({ unit: "px", value: 9 }, 480 / 1024, 2),
        4.2
    );
    assert.equal(boardStrokeWidth({ unit: "board", value: 6 }, 0.1, 2), 6);
    assert.equal(boardStrokeWidth({ unit: "px", value: 1 }, 0.1, 2), 0.5);
});

test("strokes become one group of freedraw elements with meta on the first", () => {
    let n = 0;
    const elements = strokeElements({
        strokes: [
            { points: [0, 0, 100, 0, 100, 50, 0, 0], color: null },
            { points: [10, 10, 20, 20], color: "#ff0000" },
        ],
        imageWidth: 200,
        rect: { x: 1000, y: 2000, width: 100, height: 50 },
        strokeWidth: { unit: "px", value: 4 },
        spline: true,
        pen: { color: "#1e1e1e", width: 2 },
        driverId: "mickyngub.vectorize",
        params: { mode: "outline" },
        generateId: () => `id${n++}`,
    });
    assert.equal(elements.length, 2);
    const [first, second] = elements;
    assert.equal(first.type, "freedraw");
    assert.equal(first.groupId, "id0");
    assert.equal(second.groupId, "id0");
    assert.equal(first.drawdyElementId, "id1");
    assert.equal(second.drawdyElementId, "id2");
    assert.deepEqual(
        first.points,
        [1000, 2000, 1050, 2000, 1050, 2025, 1000, 2000]
    );
    assert.equal(first.width, 50);
    assert.equal(first.height, 25);
    assert.equal(first.strokeColor, "#1e1e1e");
    assert.equal(second.strokeColor, "#ff0000");
    assert.equal(first.strokeWidth, 2);
    assert.equal(first.spline, true);
    assert.deepEqual(first.meta, {
        "mickyngub.vectorize": { v: 1, params: { mode: "outline" } },
    });
    assert.deepEqual(second.meta, {
        "mickyngub.vectorize": { v: 1, part: true },
    });
});

test("stroke validation and point counts", () => {
    assert.equal(isValidStroke({ points: [0, 0, 1, 1], color: null }), true);
    assert.equal(isValidStroke({ points: [0, 0], color: null }), false);
    assert.equal(isValidStroke({ points: [0, 0, 1], color: null }), false);
    assert.equal(isValidStroke({ points: [0, 0, 1, NaN], color: null }), false);
    assert.equal(isValidStroke({ points: [0, 0, 1, 1], color: 3 }), false);
    assert.equal(
        countPoints([
            { points: [0, 0, 1, 1, 2, 2], color: null },
            { points: [0, 0, 1, 1], color: "#000" },
        ]),
        5
    );
});
