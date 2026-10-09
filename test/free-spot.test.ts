import assert from "node:assert/strict";
import { test } from "node:test";
import {
  candidateRects,
  centredIn,
  firstFreeRect,
  overlaps,
  rightOf,
  union,
} from "../src/lib/free-spot";

const box = (x: number, y: number, width = 100, height = 50) => ({
  x,
  y,
  width,
  height,
});

test("the preferred spot wins when nothing is in the way", () => {
  const preferred = box(0, 0);
  assert.deepEqual(firstFreeRect(candidateRects(preferred), []), preferred);
});

test("a second placement steps right of the first instead of stacking on it", () => {
  const first = box(0, 0);
  const spot = firstFreeRect(candidateRects(first), [first]);
  assert.ok(spot);
  assert.equal(spot.y, 0);
  assert.equal(spot.x, first.width + 40);
  assert.equal(overlaps(spot, first, 40), false);
});

test("a full row moves the search to the next row down", () => {
  const preferred = box(0, 0);
  const row = candidateRects(preferred).slice(0, 4);
  const spot = firstFreeRect(candidateRects(preferred), row);
  assert.ok(spot);
  assert.equal(spot.x, 0);
  assert.equal(spot.y, preferred.height + 40);
});

test("no free spot among the candidates gives null", () => {
  const preferred = box(0, 0);
  const wall = box(-1000, -1000, 100000, 100000);
  assert.equal(firstFreeRect(candidateRects(preferred), [wall]), null);
});

test("touching rects within the gap count as overlapping", () => {
  assert.equal(overlaps(box(0, 0), box(120, 0), 40), true);
  assert.equal(overlaps(box(0, 0), box(141, 0), 40), false);
});

test("union, centring and right-of placement", () => {
  assert.deepEqual(union([box(0, 0), box(200, 100)]), box(0, 0, 300, 150));
  assert.equal(union([]), null);
  assert.deepEqual(centredIn(box(0, 0, 1000, 500), 100, 50), box(450, 225));
  assert.deepEqual(rightOf(box(0, 0), 30, 30), box(140, 0, 30, 30));
});
