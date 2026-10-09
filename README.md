# Vectorize

Trace an image into native Drawdy pen strokes, so a logo, a scanned sketch or a photo becomes ink you can recolour, erase and move.

## How to use

1. Click the Vectorize button (a white curve with two square nodes on a green-to-blue tile) on the right of the board.
2. Give it an image:
   - Select one image on the board. The panel loads it as you see it on the board, crop and rotation included, and shows **Using the selected image**. When you select something else, the panel keeps the image and says **Using the last selected image**. **Use selected image** reads the selection again.
   - Or click the preview and pick an image file, or drop or paste one into the panel.
3. Pick a **Mode**. A new image that looks like a photo starts in **Colour layers**; anything else starts in the mode you last picked (Outline the first time). Your pick for an image sticks until you load another one.
   - **Outline** traces the edge of every dark shape, holes included, as closed strokes.
   - **Centerline** follows the middle of each line, for line drawings and scans. Lines are split where they meet, and gaps of up to 2 px are joined.
   - **Colour layers** splits the image into 2 to 8 colours and outlines each colour in its own colour. **Drop background** (on by default) skips the largest colour that touches the image edge. It keeps the image's colours, so dark or white parts can vanish on a board of the same colour.
4. Tune the result in the live preview. The line above the controls counts strokes and points.
   - **Threshold** sets what counts as ink. **Auto** picks it from the image. Each new image sets it for you.
   - **Invert** traces light lines on a dark background.
   - **Detail tolerance**: a higher value gives fewer points and simpler strokes.
   - **Ignore specks smaller than** drops small dots and fills small pinholes.
   - **Smooth curves** draws each stroke as a smooth curve through its points.
   - **Stroke width**: **Auto** uses your pen width, or the measured line thickness in Centerline. **Fixed** uses the width you set.
   - **Colour**: your pen colour, the colour from the image, or a custom colour. Colour layers always use the image's colours.
   - **Working resolution**: 512, 1024 or 2048 px on the longest side. Higher keeps finer detail and takes longer.
5. Click **Place on board**. The strokes land as one group, to the right of the selected image at the same height, or in the middle of the part of your view the panel does not cover, 480 wide, for an uploaded image. If something is already there, they move right, then down, to the first free spot. The trace is selected, and the board only moves if the trace is out of view, keeping your zoom. The panel says **Placed the trace (330 strokes). Press ⌘Z or Ctrl+Z to undo.** One ⌘Z removes the whole trace, and ⌘Z and ⇧⌘Z (or Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) work from the panel too, outside text fields. Press Escape to close the panel; in a field, Escape leaves the field first.

Your settings are remembered for next time. The panel follows the board's light or dark theme as you switch it.

## Good to know

- The panel loads nothing from the network. Your image stays in the panel, every step runs there, and only the finished strokes go onto the board.
- Settings are saved with Drawdy's extension storage (`kv-storage`) a moment after you change them. Vectorize asks for storage and board access the first time you open it, not when the page loads.
- A crop is spotted when the image's shape on the board differs from its file by more than 1%. Then the panel reads a picture of the board at screen resolution, so anything drawn over the image comes along. A crop that keeps the image's aspect ratio, and a flip, are not detected yet. If the picture fails, the panel says **Using the full original image.**
- One placement holds at most 3,000 strokes and 200,000 points. Above that, **Place on board** turns off; raise Detail tolerance or Ignore specks.
- A board holds at most 10,000 elements. If the trace would go over, the panel says so and nothing is added.
- Strokes in your pen colour follow each viewer's light or dark theme. Colours taken from the image stay exactly as they are.

## Licence

This extension's code is [MIT](LICENSE).

## Development

```bash
npm install
npm test
npm run typecheck
npm run dev          # dev server on :5190; in Drawdy run ⌘K → "Add extension dev server" on a local board
npm run build        # regenerates src/webview-html.ts and dist/*.drawdyx
npm run preflight    # before submitting: committed, built, pushed, under Drawdy's limits, above the live version
```

Drawdy builds published versions from this repository's `src/index.ts`, so commit `src/webview-html.ts` after `npm run build`. Bump `driverVersion` in `manifest.json` for every release and add it to `CHANGELOG.md`. `npm test` holds the manifest and listing files to Drawdy's submission rules (a description of at most 500 characters, an icon of at most 256 KB, only `@drawdy/driver-protocol` imported from outside the repository), and tests the tracing steps on generated images.
