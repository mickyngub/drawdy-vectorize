# Vectorize

Trace an image into native Drawdy pen strokes, so a logo, a scanned sketch or a photo becomes ink you can recolour, erase and move.

## How to use

1. Click the Vectorize button (a white curve with two square nodes on a green-to-blue tile) on the right of the board.
2. Give it an image:
   - Select one image on the board. The panel loads it and shows **Using the selected image**. **Use selected image** reads the selection again.
   - Or click the preview and pick an image file, or drop or paste one into the panel.
3. Pick a **Mode**:
   - **Outline** traces the edge of every dark shape, holes included, as closed strokes.
   - **Centerline** follows the middle of each line, for line drawings and scans. Lines are split where they meet, and gaps of up to 2 px are joined.
   - **Colour layers** splits the image into 2 to 8 colours and outlines each colour in its own colour. **Drop background** (on by default) skips the largest colour that touches the image edge.
4. Tune the result in the live preview. The line above the controls counts strokes and points.
   - **Threshold** sets what counts as ink. **Auto** picks it from the image. Each new image sets it for you.
   - **Invert** traces light lines on a dark background.
   - **Detail tolerance**: a higher value gives fewer points and simpler strokes.
   - **Ignore specks smaller than** drops small dots and fills small pinholes.
   - **Smooth curves** draws each stroke as a smooth curve through its points.
   - **Stroke width**: **Auto** uses your pen width, or the measured line thickness in Centerline. **Fixed** uses the width you set.
   - **Colour**: your pen colour, the colour from the image, or a custom colour. Colour layers always use the image's colours.
   - **Working resolution**: 512, 1024 or 2048 px on the longest side. Higher keeps finer detail and takes longer.
5. Click **Place on board**. The strokes land as one group: to the right of the selected image at the same height, or in the middle of your view at 480 wide for an uploaded image. The board then moves to them. Press Escape to close the panel.

Your settings are remembered for next time.

## Good to know

- The panel loads nothing from the network. Your image stays in the panel, every step runs there, and only the finished strokes go onto the board.
- Settings are saved with Drawdy's extension storage (`kv-storage`) a moment after you change them.
- One placement holds at most 3,000 strokes and 200,000 points. Above that, **Place on board** turns off; raise Detail tolerance or Ignore specks.
- Placements over 500 strokes go onto the board in batches of 500, so ⌘Z removes one batch at a time.
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
