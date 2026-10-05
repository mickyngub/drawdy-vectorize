import assert from "node:assert/strict";
import { test } from "node:test";
import { traceSkeleton } from "../webview/lib/skeleton";
import { zhangSuen } from "../webview/lib/thinning";
import { maskFrom } from "./helpers";

const ends = (line: number[]) => [
    [line[0], line[1]],
    [line[line.length - 2], line[line.length - 1]],
];
const near = (a: number[], b: number[], d: number) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) <= d;

test("tracing a T gives three polylines that meet at the junction", () => {
    const w = 34;
    const h = 30;
    const skel = maskFrom(
        w,
        h,
        (x, y) =>
            (y === 5 && x >= 2 && x <= 30) || (x === 16 && y >= 5 && y <= 25)
    );
    const lines = traceSkeleton(skel, w, h, { minLength: 3, bridge: 2 });
    assert.equal(lines.length, 3);
    const junction = [16.5, 5.5];
    for (const line of lines) {
        assert.equal(
            ends(line).filter((e) => near(e, junction, 0.01)).length,
            1,
            "each branch has one end at the junction"
        );
    }
    const free = lines.flatMap(ends).filter((e) => !near(e, junction, 0.01));
    const sorted = free.map((e) => e.join(",")).sort();
    assert.deepEqual(sorted, ["16.5,25.5", "2.5,5.5", "30.5,5.5"]);
});

test("a thick T thins and traces to three branches", () => {
    const w = 60;
    const h = 50;
    const mask = maskFrom(
        w,
        h,
        (x, y) =>
            (y >= 5 && y < 11 && x >= 4 && x < 56) ||
            (x >= 27 && x < 33 && y >= 5 && y < 46)
    );
    const lines = traceSkeleton(zhangSuen(mask, w, h), w, h, {
        minLength: 9,
        bridge: 2,
    });
    assert.equal(lines.length, 3);
});

test("a gap of two pixels is bridged into one line", () => {
    const skel = maskFrom(
        30,
        5,
        (x, y) => y === 2 && x >= 2 && x <= 26 && x !== 13 && x !== 14
    );
    const lines = traceSkeleton(skel, 30, 5, { minLength: 3, bridge: 2 });
    assert.equal(lines.length, 1);
    const [line] = lines;
    const xs = [line[0], line[line.length - 2]].sort((a, b) => a - b);
    assert.deepEqual(xs, [2.5, 26.5]);
});

test("a gap of three pixels is left open", () => {
    const skel = maskFrom(
        30,
        5,
        (x, y) => y === 2 && x >= 2 && x <= 26 && (x < 12 || x > 14)
    );
    assert.equal(
        traceSkeleton(skel, 30, 5, { minLength: 3, bridge: 2 }).length,
        2
    );
});

test("short spurs are dropped and the line through them is rejoined", () => {
    const skel = maskFrom(
        40,
        12,
        (x, y) =>
            (y === 6 && x >= 2 && x <= 36) || (x === 20 && y >= 3 && y < 6)
    );
    const lines = traceSkeleton(skel, 40, 12, { minLength: 5, bridge: 0 });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].length / 2 >= 30, true);
});

test("a closed loop traces as one closed polyline", () => {
    const skel = maskFrom(
        20,
        20,
        (x, y) =>
            ((x === 4 || x === 15) && y >= 4 && y <= 15) ||
            ((y === 4 || y === 15) && x >= 4 && x <= 15)
    );
    const lines = traceSkeleton(skel, 20, 20, { minLength: 3, bridge: 2 });
    assert.equal(lines.length, 1);
    const line = lines[0];
    assert.deepEqual(line.slice(0, 2), line.slice(-2));
    assert.equal(line.length / 2, 45);
});

test("a thick crossing folds into one junction with four branches", () => {
    const w = 70;
    const h = 70;
    const mask = maskFrom(
        w,
        h,
        (x, y) =>
            (x >= 31 && x < 39 && y >= 5 && y < 65) ||
            (y >= 31 && y < 39 && x >= 5 && x < 65)
    );
    const lines = traceSkeleton(zhangSuen(mask, w, h), w, h, {
        minLength: 16,
        bridge: 2,
    });
    assert.equal(lines.length, 4);
    const inner = lines.map((line) => {
        const [a, b] = ends(line);
        return near(a, [35, 35], 6) ? a : b;
    });
    for (const point of inner) assert.deepEqual(point, inner[0]);
});
