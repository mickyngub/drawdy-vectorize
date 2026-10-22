import { FOCUS, PRIMARY, SCROLL_BODY, STATUS } from "../webview/lib/classes";
import { ICONS, icon } from "../webview/lib/icons";
import { PANEL_CSS } from "./panel-css";

const BODY = `
<div class="flex min-h-0 flex-1 flex-col sm:flex-row">
    <div class="flex shrink-0 px-4 pt-3 sm:min-w-0 sm:flex-1 sm:pb-3">
        <div class="group relative flex h-48 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-section transition-colors data-dragover:bg-hover data-empty:h-auto data-empty:border data-empty:border-dashed data-empty:border-line-strong data-empty:bg-transparent data-empty:px-4 data-empty:py-6 data-empty:hover:bg-hover sm:h-auto ${FOCUS}" id="stage" role="button" tabindex="0" aria-label="Upload an image" data-empty>
            <div class="relative h-(--h) w-(--w) flex-none ring-1 ring-line" id="frame" hidden>
                <canvas id="source" class="absolute inset-0 block size-full opacity-28"></canvas>
                <svg id="preview" class="absolute inset-0 block size-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>
            </div>
            <div class="flex flex-col items-center gap-1 text-center" id="hint" hidden>
                ${icon(ICONS.upload, "mb-1 size-5 text-fg-subtle")}
                <span class="text-label text-fg">Select an image on the board</span>
                <span class="text-body text-fg-subtle" id="hint-text"></span>
            </div>
            <div class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-dragover:opacity-100 group-data-empty:hidden"><span class="rounded-full bg-black/60 px-2.5 py-1 text-caption text-white">Click to change image</span></div>
        </div>
    </div>
    <aside class="${SCROLL_BODY} sm:w-72 sm:flex-none sm:border-l sm:border-divider" id="panel"></aside>
</div>
<footer class="flex shrink-0 flex-col gap-2 border-t border-divider px-4 py-3">
    <div class="${STATUS}" id="status" role="status" aria-live="polite"></div>
    <input type="file" id="upload-input" class="pointer-events-none absolute size-px overflow-hidden opacity-0" accept="image/*" tabindex="-1" aria-label="Upload image file" />
    <div class="flex"><button class="${PRIMARY}" id="place" disabled>Place on board</button></div>
</footer>
`;

export function shellHtml(js: string): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/google-sans-flex@5.3.2/wght.css" />
<style id="drawdy-styling">:root{/*__DRAWDY_STYLING__*/}</style>
<style>${PANEL_CSS}</style>
</head>
<body class="flex h-screen flex-col overflow-hidden bg-panel font-sans text-body text-fg antialiased">
${BODY}
<script>${js}</script>
</body>
</html>`;
}
