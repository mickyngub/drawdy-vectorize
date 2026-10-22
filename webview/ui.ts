import {
    FOCUS,
    LABEL_ROW,
    SECTION,
    SEGMENT,
    SLIDER,
    TRACK,
} from "./lib/classes";
import { ICONS, icon } from "./lib/icons";

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    parent?: HTMLElement
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
}

export type SliderSpec = {
    label: string;
    min: number;
    max: number;
    step: number;
    format?: (value: number) => string;
};

export type SliderControl = {
    set(value: number): void;
    setDim(dim: boolean): void;
    setText(text: string): void;
    head: HTMLElement;
};

const decimals = (step: number): number =>
    (String(step).split(".")[1] ?? "").length;

export function makeSlider(
    parent: HTMLElement,
    spec: SliderSpec,
    initial: number,
    onInput: (value: number) => void
): SliderControl {
    const wrap = el("div", `group ${SECTION}`, parent);
    const head = el(
        "div",
        `${LABEL_ROW} group-data-dim:text-fg-disabled`,
        wrap
    );
    const label = el("label", "mr-auto min-w-0 truncate", head);
    label.textContent = spec.label;
    const value = el(
        "span",
        "shrink-0 text-fg-subtle tabular-nums group-data-dim:text-fg-disabled",
        head
    );
    const input = el(
        "input",
        `${SLIDER} disabled:cursor-not-allowed group-data-dim:bg-control group-data-dim:bg-none group-data-dim:[&::-webkit-slider-thumb]:bg-fg-disabled`,
        wrap
    );
    input.type = "range";
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.setAttribute("aria-label", spec.label);
    const places = decimals(spec.step);
    const format = spec.format ?? ((v: number) => v.toFixed(places));

    const show = (v: number) => {
        value.textContent = format(v);
        input.style.setProperty(
            "--fill",
            `${((v - spec.min) / (spec.max - spec.min)) * 100}%`
        );
    };
    input.value = String(initial);
    show(initial);

    input.addEventListener("input", () => {
        const v = Number(input.value);
        show(v);
        onInput(v);
    });

    return {
        set(v) {
            input.value = String(v);
            show(v);
        },
        setDim(dim) {
            wrap.toggleAttribute("data-dim", dim);
            input.disabled = dim;
        },
        setText(text) {
            value.textContent = text;
        },
        head,
    };
}

export function fillSegmented<T extends string | number>(
    row: HTMLElement,
    options: [T, string][],
    initial: T,
    onPick: (value: T) => void
): (value: T) => void {
    const buttons = options.map(([value, text]) => {
        const button = el("button", SEGMENT, row);
        button.type = "button";
        button.textContent = text;
        button.addEventListener("click", () => {
            paint(value);
            onPick(value);
        });
        return { value, button };
    });

    const paint = (current: T) => {
        for (const entry of buttons) {
            entry.button.setAttribute(
                "aria-pressed",
                String(entry.value === current)
            );
        }
    };
    paint(initial);
    return paint;
}

export type SegmentedControl<T> = {
    set(value: T): void;
    wrap: HTMLElement;
};

export function makeSegmented<T extends string | number>(
    parent: HTMLElement,
    label: string,
    options: [T, string][],
    initial: T,
    onPick: (value: T) => void
): SegmentedControl<T> {
    const wrap = el("div", SECTION, parent);
    const head = el("div", LABEL_ROW, wrap);
    const text = el("label", undefined, head);
    text.textContent = label;
    const row = el("div", TRACK, wrap);
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", label);
    const paint = fillSegmented(row, options, initial, onPick);
    return { set: paint, wrap };
}

export type CheckControl = {
    set(value: boolean): void;
};

export function makeCheckbox(
    parent: HTMLElement,
    label: string,
    initial: boolean,
    onChange: (value: boolean) => void
): CheckControl {
    const wrap = el(
        "label",
        "inline-flex cursor-pointer items-center gap-2 self-start text-label text-fg-muted",
        parent
    );
    const box = el("span", "relative grid size-4 shrink-0", wrap);
    const input = el(
        "input",
        `peer size-4 cursor-pointer appearance-none rounded-sm border border-line-strong transition-colors checked:border-transparent checked:bg-accent-pressed ${FOCUS}`,
        box
    );
    input.type = "checkbox";
    input.checked = initial;
    box.insertAdjacentHTML(
        "beforeend",
        icon(
            ICONS.check,
            "pointer-events-none absolute inset-0.5 size-3 text-on-accent opacity-0 peer-checked:opacity-100"
        )
    );
    const text = el("span", undefined, wrap);
    text.textContent = label;
    input.addEventListener("change", () => onChange(input.checked));
    return {
        set(value) {
            input.checked = value;
        },
    };
}
