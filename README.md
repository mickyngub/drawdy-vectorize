# Vectorize

Trace an image into real Drawdy pen strokes. A logo, a scanned sketch or a photo becomes ink you can recolour, erase and move like anything you drew yourself.

## What it's for

- **Digitising paper sketches**: photograph a drawing and turn it into clean, editable strokes.
- **Logos and icons as ink** that you can recolour to fit your board.
- **Illustrations from photos**: split a picture into colour layers for a bold, graphic look.

## How to use

1. Click the **Vectorize** button on the right of the board.
2. Select an image on the board, or pick an image file, or drop or paste one into the panel.
3. Pick a **Mode**:
   - **Outline** traces the edge of every dark shape.
   - **Centerline** follows the middle of each line, best for line drawings and scans.
   - **Colour layers** splits the image into 2 to 8 colours and traces each in its own colour.
4. Tune the result in the live preview.
5. Click **Place on board**. The strokes land as one group, beside the image you traced or in view for an uploaded one, and one ⌘Z or Ctrl+Z removes them all.

## Options

- **Threshold**: what counts as ink. **Auto** picks it from the image.
- **Invert**: trace light lines on a dark background.
- **Detail tolerance**: higher gives fewer points and simpler strokes.
- **Ignore specks**: drop small dots and fill small pinholes.
- **Smooth curves**: draw each stroke as a smooth curve.
- **Stroke width**: your pen width, the measured line thickness, or a fixed width.
- **Colour**: your pen colour, the image's colour, or any colour. Colour layers always use the image's colours.
- **Working resolution**: 512, 1024 or 2048 px. Higher keeps finer detail and takes longer.

## Tips

- Photos start in Colour layers; **Drop background** (on by default) leaves out the background colour.
- Too many strokes? Raise **Detail tolerance** or **Ignore specks**. One trace holds up to 3,000 strokes.
- Strokes in your pen colour adapt to light and dark mode. Colours taken from the image stay exactly as they are.

## Privacy

- Nothing loads from the network. Your image stays in the panel, the tracing runs there, and only the finished strokes go onto the board.
- Your settings are saved for next time.

## Credits and licence

- The extension's code is [MIT](https://github.com/mickyngub/drawdy-vectorize/blob/main/LICENSE). Building it yourself? See [DEVELOPMENT.md](https://github.com/mickyngub/drawdy-vectorize/blob/main/DEVELOPMENT.md).
