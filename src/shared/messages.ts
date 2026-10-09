export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type Pen = {
    color: string;
    width: number;
};

// Points are flat [x0, y0, x1, y1, ...] in working-image pixels; a null colour means the pen colour.
export type StrokeSpec = {
    points: number[];
    color: string | null;
};

export type StrokeWidthSpec =
    | { unit: "pen" }
    | { unit: "px"; value: number }
    | { unit: "board"; value: number };

export type WebviewToDriver =
    | { type: "ready" }
    | { type: "params"; params: Record<string, unknown> }
    | { type: "use-selection" }
    | {
          type: "place";
          strokes: StrokeSpec[];
          imageWidth: number;
          imageHeight: number;
          strokeWidth: StrokeWidthSpec;
          spline: boolean;
          sourceId: string | null;
          params: Record<string, unknown>;
      }
    | { type: "history"; action: "undo" | "redo" }
    | { type: "close" };

export type DriverToWebview =
    | { type: "init"; params?: Record<string, unknown>; pen: Pen }
    | { type: "pen"; pen: Pen }
    | { type: "theme"; css: string }
    | { type: "selection"; ids: string[] }
    | {
          type: "source";
          blob: Blob;
          elementId: string;
          displayWidth: number;
          displayHeight: number;
          note: string | null;
      }
    | { type: "placed"; strokes: number }
    | { type: "error"; message: string };
