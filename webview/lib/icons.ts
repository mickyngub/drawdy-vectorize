// Remix Icon 4.9.0 glyphs, the host's icon set.
export const ICONS = {
    upload: "M4 19H20V12H22V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V12H4V19ZM13 9V16H11V9H6L12 3L18 9H13Z",
    check: "M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z",
} as const;

export function icon(path: string, className = "size-4 shrink-0"): string {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="${className}"><path d="${path}"/></svg>`;
}
