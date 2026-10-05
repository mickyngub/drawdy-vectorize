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
    const wrap = el("div", "field", parent);
    const head = el("div", "field-head", wrap);
    const label = el("label", undefined, head);
    label.textContent = spec.label;
    const value = el("span", "value", head);
    const input = el("input", undefined, wrap);
    input.type = "range";
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.setAttribute("aria-label", spec.label);
    const places = decimals(spec.step);
    const format = spec.format ?? ((v: number) => v.toFixed(places));

    const show = (v: number) => {
        value.textContent = format(v);
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
            wrap.classList.toggle("dim", dim);
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
        const button = el("button", undefined, row);
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
            const on = entry.value === current;
            entry.button.classList.toggle("on", on);
            entry.button.setAttribute("aria-pressed", String(on));
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
    const wrap = el("div", "field", parent);
    const head = el("div", "field-head", wrap);
    const text = el("label", undefined, head);
    text.textContent = label;
    const row = el("div", "seg", wrap);
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
    const wrap = el("label", "check", parent);
    const input = el("input", undefined, wrap);
    input.type = "checkbox";
    input.checked = initial;
    const text = el("span", undefined, wrap);
    text.textContent = label;
    input.addEventListener("change", () => onChange(input.checked));
    return {
        set(value) {
            input.checked = value;
        },
    };
}

export function makeRule(parent: HTMLElement): void {
    el("div", "rule", parent);
}
