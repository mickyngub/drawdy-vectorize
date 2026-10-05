import assert from "node:assert/strict";
import { test } from "node:test";
import {
    distanceTransform,
    medianThickness,
    zhangSuen,
} from "../webview/lib/thinning";
import { maskFrom } from "./helpers";

test("Zhang–Suen turns a 5 px bar into a 1 px skeleton on its centre row", () => {
    const w = 40;
    const h = 11;
    const mask = maskFrom(w, h, (x, y) => x >= 3 && x < 37 && y >= 3 && y < 8);
    const skel = zhangSuen(mask, w, h);
    let total = 0;
    for (let x = 6; x < 34; x++) {
        let column = 0;
        for (let y = 0; y < h; y++) {
            if (skel[y * w + x]) {
                column++;
                assert.equal(y, 5, `column ${x} is off centre`);
            }
        }
        assert.equal(column, 1, `column ${x} is ${column} px thick`);
        total += column;
    }
    assert.ok(total > 0);
    for (let i = 0; i < skel.length; i++) if (skel[i]) assert.equal(mask[i], 1);
});

test("the distance transform reads a 5 px line as 5 px thick", () => {
    const w = 40;
    const h = 11;
    const mask = maskFrom(w, h, (x, y) => x >= 3 && x < 37 && y >= 3 && y < 8);
    const dist = distanceTransform(mask, w, h);
    assert.equal(dist[5 * w + 20], 3);
    assert.equal(dist[3 * w + 20], 1);
    assert.equal(dist[0], 0);
    assert.equal(medianThickness(dist, zhangSuen(mask, w, h)), 5);
});

test("thinning keeps a thick diagonal line as one thin line", () => {
    const w = 80;
    const h = 80;
    for (const slope of [1, -1]) {
        const mask = maskFrom(w, h, (x, y) => {
            const along = slope > 0 ? x - y : x + y - (w - 1);
            return Math.abs(along) <= 3 && x >= 10 && x < 70;
        });
        const skel = zhangSuen(mask, w, h);
        const rows = new Set<number>();
        let count = 0;
        for (let i = 0; i < skel.length; i++) {
            if (!skel[i]) continue;
            count++;
            rows.add(Math.floor(i / w));
        }
        assert.ok(rows.size >= 50, `the line spans ${rows.size} rows`);
        assert.ok(
            count <= rows.size * 1.2,
            `${count} pixels over ${rows.size} rows is not thin`
        );
    }
});
