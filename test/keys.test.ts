import assert from "node:assert/strict";
import { test } from "node:test";
import { historyAction, isEditable } from "../webview/lib/keys";

const key = (
    k: string,
    mods: Partial<{
        metaKey: boolean;
        ctrlKey: boolean;
        shiftKey: boolean;
        altKey: boolean;
    }> = {}
) => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
});

test("⌘Z and Ctrl+Z undo; with Shift, or Ctrl+Y, they redo", () => {
    assert.equal(historyAction(key("z", { metaKey: true })), "undo");
    assert.equal(historyAction(key("z", { ctrlKey: true })), "undo");
    assert.equal(
        historyAction(key("Z", { metaKey: true, shiftKey: true })),
        "redo"
    );
    assert.equal(
        historyAction(key("z", { ctrlKey: true, shiftKey: true })),
        "redo"
    );
    assert.equal(historyAction(key("y", { ctrlKey: true })), "redo");
});

test("other keys and plain letters are left alone", () => {
    assert.equal(historyAction(key("z")), null);
    assert.equal(historyAction(key("y", { metaKey: true })), null);
    assert.equal(
        historyAction(key("z", { metaKey: true, altKey: true })),
        null
    );
    assert.equal(historyAction(key("c", { metaKey: true })), null);
});

test("text fields keep their own undo; sliders, checkboxes and buttons do not", () => {
    assert.equal(isEditable({ tagName: "INPUT", type: "text" }), true);
    assert.equal(isEditable({ tagName: "INPUT", type: "number" }), true);
    assert.equal(isEditable({ tagName: "TEXTAREA" }), true);
    assert.equal(isEditable({ tagName: "SELECT" }), true);
    assert.equal(isEditable({ tagName: "DIV", isContentEditable: true }), true);
    assert.equal(isEditable({ tagName: "INPUT", type: "range" }), false);
    assert.equal(isEditable({ tagName: "INPUT", type: "checkbox" }), false);
    assert.equal(isEditable({ tagName: "INPUT", type: "color" }), false);
    assert.equal(isEditable({ tagName: "BUTTON" }), false);
    assert.equal(isEditable({ tagName: "TEXTAREA", readOnly: true }), false);
    assert.equal(
        isEditable({ tagName: "INPUT", type: "text", disabled: true }),
        false
    );
    assert.equal(isEditable(null), false);
});
