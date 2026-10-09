export type HistoryAction = "undo" | "redo";

type KeyLike = {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
};

type FieldLike = {
    tagName?: unknown;
    type?: unknown;
    readOnly?: unknown;
    disabled?: unknown;
    isContentEditable?: unknown;
};

const TEXT_INPUTS = new Set([
    "text",
    "search",
    "email",
    "url",
    "tel",
    "password",
    "number",
    "date",
    "datetime-local",
    "month",
    "time",
    "week",
]);

// Sliders, checkboxes and buttons have no undo of their own, so ⌘Z on them goes to the board.
export function isEditable(target: unknown): boolean {
    if (!target || typeof target !== "object") return false;
    const field = target as FieldLike;
    if (field.isContentEditable === true) return true;
    if (typeof field.tagName !== "string") return false;
    const tag = field.tagName.toLowerCase();
    if (tag === "select") return field.disabled !== true;
    if (tag !== "textarea" && tag !== "input") return false;
    if (field.readOnly === true || field.disabled === true) return false;
    return (
        tag === "textarea" ||
        TEXT_INPUTS.has(String(field.type ?? "text").toLowerCase())
    );
}

export function historyAction(event: KeyLike): HistoryAction | null {
    if (event.altKey || !(event.metaKey || event.ctrlKey)) return null;
    const key = event.key.toLowerCase();
    if (key === "z") return event.shiftKey ? "redo" : "undo";
    if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey)
        return "redo";
    return null;
}

export function wireKeys(handlers: {
    history: (action: HistoryAction) => void;
    close: () => void;
}): void {
    document.addEventListener("keydown", (event) => {
        const field = document.activeElement;
        const editing = isEditable(field);
        if (event.key === "Escape") {
            event.preventDefault();
            if (editing) (field as HTMLElement).blur();
            else handlers.close();
            return;
        }
        if (editing) return;
        const action = historyAction(event);
        if (!action) return;
        event.preventDefault();
        handlers.history(action);
    });
}
