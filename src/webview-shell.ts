const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--drawdy-background, #ffffff);
    color: var(--drawdy-foreground, #111111);
    font-size: 12px;
    line-height: 1.4;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
}
button, input, select { font: inherit; color: inherit; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--drawdy-primary, #4f46e5); outline-offset: 1px; }

.app {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
}

.stage {
    flex: 1;
    min-width: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    background: var(--drawdy-background, #ffffff);
    overflow: hidden;
    cursor: pointer;
}
.stage:focus-visible { outline: 2px solid var(--drawdy-primary, #4f46e5); outline-offset: -2px; }
.pick {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 12px;
    color: #ffffff;
    font-size: 11px;
    opacity: 0;
    transition: opacity 120ms ease;
    pointer-events: none;
}
.pick span {
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.62);
}
.stage:hover .pick, .stage:focus-visible .pick { opacity: 1; }
.stage.empty .pick { display: none; }
.frame {
    position: relative;
    flex: none;
    border: 1px dashed var(--drawdy-border, #e5e5e5);
}
.frame[hidden] { display: none; }
.frame canvas, .frame svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
}
.frame canvas { opacity: 0.28; }
.stage.dragover::after {
    content: "";
    position: absolute;
    inset: 6px;
    border: 2px dashed var(--drawdy-primary, #4f46e5);
    border-radius: var(--drawdy-radius-md, 8px);
    pointer-events: none;
}
.hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    pointer-events: none;
}
.hint[hidden] { display: none; }
.hint span {
    max-width: 260px;
    padding: 8px 12px;
    border-radius: var(--drawdy-radius-md, 8px);
    border: 1px solid var(--drawdy-border, #e5e5e5);
    background: var(--drawdy-surface, rgba(255, 255, 255, 0.92));
    color: var(--drawdy-muted-foreground, #7a7a7a);
    font-size: 11px;
}

@media (max-width: 640px) {
    .app { flex-direction: column; }
    .app .stage {
        flex: none;
        height: 40vh;
        min-height: 180px;
        padding: 10px;
    }
    .app .panel {
        width: auto;
        flex: 1;
        min-height: 0;
        border-left: none;
        border-top: 1px solid var(--drawdy-border, #e5e5e5);
    }
    footer {
        flex-wrap: wrap;
        gap: 8px 10px;
    }
    footer .status { flex: 1 1 100%; }
    footer .btn { flex: 1 1 auto; }
}

.panel {
    width: 272px;
    flex: none;
    border-left: 1px solid var(--drawdy-border, #e5e5e5);
    background: var(--drawdy-surface, transparent);
    overflow-y: auto;
    padding: 10px 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.readout {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    color: var(--drawdy-muted-foreground, #7a7a7a);
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}
.readout button {
    border: 1px solid var(--drawdy-border, #e5e5e5);
    background: transparent;
    border-radius: var(--drawdy-radius-sm, 4px);
    padding: 2px 7px;
    font-size: 10px;
    cursor: pointer;
    color: var(--drawdy-muted-foreground, #7a7a7a);
}
.readout button:hover { color: var(--drawdy-foreground, #111111); }

.source {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
}
.source span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.small-btn {
    flex: none;
    border: 1px solid var(--drawdy-border, #e5e5e5);
    background: transparent;
    border-radius: var(--drawdy-radius-sm, 4px);
    padding: 2px 7px;
    font-size: 10px;
    cursor: pointer;
    color: var(--drawdy-muted-foreground, #7a7a7a);
}
.small-btn:hover:not(:disabled) { color: var(--drawdy-foreground, #111111); }
.small-btn:disabled { opacity: 0.4; cursor: default; }
.field-head label { margin-right: auto; }
.field-head .small-btn { margin-left: 6px; }
.field[hidden], .group[hidden], .note[hidden] { display: none; }
.group { display: flex; flex-direction: column; gap: 10px; }
.check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    cursor: pointer;
}
.check input { margin: 0; accent-color: var(--drawdy-primary, #4f46e5); }
.note {
    font-size: 10px;
    color: var(--drawdy-muted-foreground, #7a7a7a);
}
.colour-row { display: flex; align-items: center; gap: 6px; }
.colour-row .seg { flex: 1; }
.colour-row input[type="color"][hidden] { display: none; }

.field { display: flex; flex-direction: column; gap: 3px; }
.field.dim { opacity: 0.4; }
.field-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
}
.field-head label {
    font-size: 10px;
    letter-spacing: 0.02em;
    color: var(--drawdy-muted-foreground, #7a7a7a);
}
.field-head .value {
    font-size: 10px;
    font-variant-numeric: tabular-nums;
}
input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 14px;
    background: transparent;
    cursor: pointer;
}
input[type="range"]::-webkit-slider-runnable-track {
    height: 3px;
    border-radius: 999px;
    background: var(--drawdy-border, #e0e0e0);
}
input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 11px;
    height: 11px;
    margin-top: -4px;
    border-radius: 50%;
    background: var(--drawdy-primary, #4f46e5);
}
input[type="range"]::-moz-range-track {
    height: 3px;
    border-radius: 999px;
    background: var(--drawdy-border, #e0e0e0);
}
input[type="range"]::-moz-range-thumb {
    width: 11px;
    height: 11px;
    border: none;
    border-radius: 50%;
    background: var(--drawdy-primary, #4f46e5);
}

.seg {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
}
.seg button {
    flex: 1 1 auto;
    min-width: 0;
    padding: 3px 6px;
    border: 1px solid var(--drawdy-border, #e5e5e5);
    background: transparent;
    color: var(--drawdy-muted-foreground, #7a7a7a);
    border-radius: var(--drawdy-radius-sm, 4px);
    cursor: pointer;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.seg button:hover { color: var(--drawdy-foreground, #111111); }
.seg button.on {
    background: var(--drawdy-primary, #4f46e5);
    border-color: var(--drawdy-primary, #4f46e5);
    color: var(--drawdy-primary-foreground, #ffffff);
}

input[type="color"] {
    width: 26px;
    height: 20px;
    padding: 0;
    border: 1px solid var(--drawdy-border, #e5e5e5);
    border-radius: var(--drawdy-radius-sm, 4px);
    background: transparent;
    cursor: pointer;
}

.rule {
    height: 1px;
    background: var(--drawdy-border, #e5e5e5);
    margin: 2px 0;
}

footer {
    flex: none;
    border-top: 1px solid var(--drawdy-border, #e5e5e5);
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--drawdy-surface, transparent);
}
footer .grow { flex: 1; min-width: 0; }
.file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    overflow: hidden;
    pointer-events: none;
}
.status {
    font-size: 10px;
    color: var(--drawdy-muted-foreground, #7a7a7a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.status.bad { color: var(--drawdy-destructive, #dc2626); }
.status.good { color: var(--drawdy-success, #16a34a); }
.btn {
    flex: none;
    padding: 5px 11px;
    border-radius: var(--drawdy-radius-sm, 4px);
    border: 1px solid var(--drawdy-border, #e5e5e5);
    background: transparent;
    cursor: pointer;
    font-size: 11px;
}
.btn:hover:not(:disabled) { border-color: var(--drawdy-foreground, #111111); }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.primary {
    background: var(--drawdy-primary, #4f46e5);
    border-color: var(--drawdy-primary, #4f46e5);
    color: var(--drawdy-primary-foreground, #ffffff);
}
`;

const BODY = `
<div class="app">
    <div class="stage empty" id="stage" role="button" tabindex="0" aria-label="Upload an image">
        <div class="frame" id="frame" hidden>
            <canvas id="source"></canvas>
            <svg id="preview" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>
        </div>
        <div class="hint" id="hint" hidden><span id="hint-text"></span></div>
        <div class="pick"><span>Click to change image</span></div>
    </div>
    <aside class="panel" id="panel"></aside>
</div>
<footer>
    <span class="status grow" id="status" role="status" aria-live="polite"></span>
    <input type="file" id="upload-input" class="file-input" accept="image/*" tabindex="-1" aria-label="Upload image file" />
    <button class="btn primary" id="place" disabled>Place on board</button>
</footer>
`;

export function shellHtml(js: string): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>:root{/*__DRAWDY_STYLING__*/}</style>
<style>${CSS}</style>
</head>
<body>
${BODY}
<script>${js}</script>
</body>
</html>`;
}
