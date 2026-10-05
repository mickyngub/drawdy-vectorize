import assert from "node:assert/strict";
import { test } from "node:test";
import {
    closeRing,
    polylineLength,
    rdp,
    prepareSpline,
    rdpClosed,
    smoothPolyline,
} from "../webview/lib/simplify";

function squareRing(start: number): number[] {
    const pts: number[] = [];
    for (let t = 0; t < 10; t += 0.5) pts.push(t, 0);
    for (let t = 0; t < 10; t += 0.5) pts.push(10, t);
    for (let t = 10; t > 0; t -= 0.5) pts.push(t, 10);
    for (let t = 10; t > 0; t -= 0.5) pts.push(0, t);
    const n = pts.length;
    return pts
        .slice(start * 2)
        .concat(pts.slice(0, start * 2))
        .slice(0, n);
}

const corners = (pts: number[]) => {
    const out: string[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(`${pts[i]},${pts[i + 1]}`);
    return out.sort();
};

test("RDP keeps exactly the corners of a square", () => {
    for (const start of [0, 7, 23]) {
        const ring = rdpClosed(squareRing(start), 0.5);
        assert.deepEqual(corners(ring), ["0,0", "0,10", "10,0", "10,10"]);
    }
});

test("RDP on an open line keeps the ends and the bend", () => {
    const line = [0, 0, 1, 0.1, 2, 0, 3, 0, 3, 1, 3, 2, 3, 3];
    assert.deepEqual(rdp(line, 0.5), [0, 0, 3, 0, 3, 3]);
});

test("closing a ring repeats its first point", () => {
    const closed = closeRing([0, 0, 4, 0, 4, 3]);
    assert.deepEqual(closed, [0, 0, 4, 0, 4, 3, 0, 0]);
    assert.equal(polylineLength(closed), 12);
});

test("smoothing flattens a pixel staircase and keeps the ends", () => {
    const stairs: number[] = [];
    for (let i = 0; i < 20; i++) stairs.push(i, i % 2);
    const smooth = smoothPolyline(stairs, 2);
    assert.deepEqual(smooth.slice(0, 2), [0, 0]);
    assert.deepEqual(smooth.slice(-2), [19, 1]);
    for (let i = 3; i < 17; i++) {
        assert.ok(
            Math.abs(smooth[i * 2 + 1] - 0.5) <= 0.1,
            `y ${smooth[i * 2 + 1]}`
        );
    }
    assert.deepEqual(rdp(smooth, 0.5).length, 4);
});

// Samples the board's uniform Catmull-Rom curve through `points`, open ends clamped.
function sampleSpline(points: number[]): [number, number][] {
    const n = points.length / 2;
    const at = (i: number): [number, number] => {
        const k = Math.max(0, Math.min(n - 1, i));
        return [points[k * 2], points[k * 2 + 1]];
    };
    const out: [number, number][] = [];
    for (let i = 0; i < n - 1; i++) {
        const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        for (let t = 0; t <= 1; t += 0.05) {
            const u = 1 - t;
            out.push([
                u ** 3 * p1[0] +
                    3 * u * u * t * c1[0] +
                    3 * u * t * t * c2[0] +
                    t ** 3 * p2[0],
                u ** 3 * p1[1] +
                    3 * u * u * t * c1[1] +
                    3 * u * t * t * c2[1] +
                    t ** 3 * p2[1],
            ]);
        }
    }
    return out;
}

test("spline preparation keeps the board's curve on a sharp corner", () => {
    const corner = [0, 100, 99, 1, 100, 0, 101, 1, 200, 100];
    const offLine = (pts: [number, number][]) =>
        Math.max(...pts.map(([x, y]) => Math.abs(y - Math.abs(x - 100))));
    assert.ok(offLine(sampleSpline(corner)) > 5, "the raw points bulge");
    const prepared = prepareSpline(corner, 10, 1.5);
    assert.ok(
        offLine(sampleSpline(prepared)) < 1.5,
        "the prepared points stay on the line"
    );
    assert.deepEqual(prepared.slice(0, 2), [0, 100]);
    assert.deepEqual(prepared.slice(-2), [200, 100]);
    for (let i = 2; i < prepared.length; i += 2) {
        const step = Math.hypot(
            prepared[i] - prepared[i - 2],
            prepared[i + 1] - prepared[i - 1]
        );
        assert.ok(step <= 10 + 1e-9, `segment ${step}`);
    }
});
