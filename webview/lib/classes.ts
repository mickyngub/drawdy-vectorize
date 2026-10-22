export const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const SCROLL_BODY =
    "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4 [scrollbar-width:thin] [scrollbar-color:var(--color-line-strong)_transparent]";

export const SECTION = "flex flex-col gap-2";

export const LABEL_ROW =
    "flex min-h-4 items-center justify-between gap-2 text-label text-fg-muted";

export const HINT = "text-body text-fg-subtle";

export const PRIMARY = `inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-accent px-3 text-label-md text-on-accent transition-colors hover:bg-accent-hover active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-disabled disabled:text-fg-disabled ${FOCUS} focus-visible:ring-offset-2 focus-visible:ring-offset-panel`;

const QUIET =
    "cursor-pointer items-center justify-center border border-line bg-subtle text-fg-muted transition-colors hover:bg-hover hover:text-fg active:bg-pressed disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-subtle";

export const SMALL = `inline-flex h-6 shrink-0 gap-1 rounded-md px-2 text-label ${QUIET} ${FOCUS}`;

export const TRACK = "flex h-8 gap-0.5 rounded-lg bg-control-subtle p-0.5";

export const SEGMENT = `h-7 min-w-0 flex-1 cursor-pointer truncate rounded-md px-2 text-label text-fg-subtle transition-colors hover:text-fg aria-pressed:bg-control aria-pressed:text-fg disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:text-fg-disabled ${FOCUS}`;

export const SLIDER =
    "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,var(--color-accent)_var(--fill),var(--color-control)_var(--fill))] focus-visible:outline-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-[0_1px_2px_rgb(0_0_0/0.3)] focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring focus-visible:[&::-webkit-slider-thumb]:ring-offset-2 focus-visible:[&::-webkit-slider-thumb]:ring-offset-panel [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent";

export const COLOUR_INPUT = `shrink-0 cursor-pointer appearance-none border border-line-strong bg-transparent p-0 transition-colors hover:border-fg-subtle [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 ${FOCUS}`;

export const STATUS =
    "text-body text-fg-subtle empty:-mb-2 data-[tone=good]:text-success data-[tone=bad]:rounded-lg data-[tone=bad]:bg-danger-subtle data-[tone=bad]:px-3 data-[tone=bad]:py-2 data-[tone=bad]:text-fg";
