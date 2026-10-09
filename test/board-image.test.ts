import assert from "node:assert/strict";
import { test } from "node:test";
import type { DriverCommandIssuer } from "@drawdy/driver-protocol";
import {
    CAPTURE_PADDING,
    captureCrop,
    isCropped,
    isRotated,
    readBoardImage,
    rotatedBox,
} from "../src/lib/board-image";

const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
});

type Reply = { error?: { type: string }; value?: unknown };

function fakeBoard(replies: Record<string, Reply>) {
    const asked: string[] = [];
    const issueCommand = (async (command: { type: string }) => {
        asked.push(command.type);
        return { res: replies[command.type] ?? { error: { type: "runtime" } } };
    }) as unknown as DriverCommandIssuer;
    let n = 0;
    return {
        asked,
        ctx: {
            issueCommand,
            driverId: "test.driver",
            nextRequestId: () => String(n++),
        },
    };
}

test("an aspect ratio off by more than 1% counts as a crop", () => {
    assert.equal(isCropped(rect(0, 0, 400, 200), 800, 400), false);
    assert.equal(isCropped(rect(0, 0, 403, 200), 800, 400), false);
    assert.equal(isCropped(rect(0, 0, 200, 200), 800, 400), true);
    assert.equal(isCropped(rect(0, 0, 400, 210), 800, 400), true);
    assert.equal(isCropped(rect(0, 0, 0, 200), 800, 400), false);
});

test("only a rotation away from a whole turn counts", () => {
    assert.equal(isRotated(0), false);
    assert.equal(isRotated(Math.PI * 2), false);
    assert.equal(isRotated(-Math.PI * 2), false);
    assert.equal(isRotated(Math.PI / 2), true);
    assert.equal(isRotated(-0.3), true);
    assert.equal(isRotated(undefined), false);
    assert.equal(isRotated(Number.NaN), false);
});

test("the crop maps the element rect into the padded, scaled screenshot", () => {
    const drawn = rect(100, 50, 300, 200);
    const png = {
        width: (300 + 2 * CAPTURE_PADDING) * 2,
        height: (200 + 2 * CAPTURE_PADDING) * 2,
    };
    assert.deepEqual(captureCrop(rect(150, 50, 200, 200), drawn, png), {
        x: (150 - 100 + CAPTURE_PADDING) * 2,
        y: CAPTURE_PADDING * 2,
        width: 400,
        height: 400,
    });
});

test("a quarter turn swaps the sides and a big image is capped", () => {
    const quarter = rotatedBox(800, 400, Math.PI / 2);
    assert.equal(quarter.width, 400);
    assert.equal(quarter.height, 800);
    assert.equal(quarter.scale, 1);
    const big = rotatedBox(9000, 6000, Math.PI / 4, 2048);
    assert.equal(Math.max(big.width, big.height), 2048);
    assert.ok(big.scale < 1);
});

test("a shape is not an image", async () => {
    const { ctx } = fakeBoard({
        "command:scene:get-drawdy-elements": {
            value: { drawdyElements: [{ id: "a", type: "path" }] },
        },
    });
    assert.deepEqual(await readBoardImage(ctx, "a"), {
        ok: false,
        reason: "not-image",
    });
});

test("a denied scene permission is reported as a permission problem", async () => {
    const { ctx } = fakeBoard({
        "command:scene:get-drawdy-elements": {
            error: { type: "unauthorized" },
        },
    });
    assert.deepEqual(await readBoardImage(ctx, "a"), {
        ok: false,
        reason: "permission",
    });
});

test("an image that cannot be decoded here comes back as the original file", async () => {
    const blob = new Blob(["<svg/>"], { type: "image/svg+xml" });
    const { ctx, asked } = fakeBoard({
        "command:scene:get-drawdy-elements": {
            value: {
                drawdyElements: [
                    {
                        id: "a",
                        type: "image",
                        x: 10,
                        y: 20,
                        width: 200,
                        height: 100,
                        rotation: 0,
                    },
                ],
            },
        },
        "command:scene:get-image-source": { value: { blob } },
    });
    const read = await readBoardImage(ctx, "a");
    assert.ok(read.ok);
    assert.equal(read.image.blob, blob);
    assert.deepEqual(read.image.rect, rect(10, 20, 200, 100));
    assert.equal(read.image.note, null);
    assert.ok(!asked.includes("command:scene:capture-screenshot"));
});
