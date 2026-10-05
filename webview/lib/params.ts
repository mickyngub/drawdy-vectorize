import { DEFAULTS, type ColourMode, type Mode, type Params } from "./trace";

export const MODES: [Mode, string][] = [
    ["outline", "Outline"],
    ["centerline", "Centerline"],
    ["layers", "Colour layers"],
];

export const COLOUR_MODES: [ColourMode, string][] = [
    ["pen", "Pen"],
    ["image", "From image"],
    ["custom", "Custom"],
];

export const RESOLUTIONS: [number, string][] = [
    [512, "512"],
    [1024, "1024"],
    [2048, "2048"],
];

export const RANGES = {
    threshold: { min: 1, max: 255, step: 1 },
    detail: { min: 0.2, max: 6, step: 0.1 },
    specks: { min: 0, max: 400, step: 1 },
    width: { min: 0.5, max: 20, step: 0.5 },
    colours: { min: 2, max: 8, step: 1 },
} as const;

const clamp = (value: number, min: number, max: number, step: number) => {
    const snapped = Math.round(value / step) * step;
    return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
};

export function sanitizeParams(raw: unknown): Params {
    const out: Params = { ...DEFAULTS };
    if (!raw || typeof raw !== "object") return out;
    const r = raw as Record<string, unknown>;
    if (MODES.some(([m]) => m === r.mode)) out.mode = r.mode as Mode;
    if (COLOUR_MODES.some(([c]) => c === r.colour))
        out.colour = r.colour as ColourMode;
    if (RESOLUTIONS.some(([v]) => v === r.resolution))
        out.resolution = r.resolution as number;
    for (const key of [
        "invert",
        "smooth",
        "widthAuto",
        "dropBackground",
    ] as const) {
        if (typeof r[key] === "boolean") out[key] = r[key] as boolean;
    }
    for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
        const value = r[key];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const { min, max, step } = RANGES[key];
        out[key] = clamp(value, min, max, step);
    }
    if (typeof r.custom === "string" && /^#[0-9a-f]{6}$/i.test(r.custom))
        out.custom = r.custom.toLowerCase();
    return out;
}
