import { clamp } from "./deadzone";

/**
 * Responsive column geometry for the masonry item layout (owner feedback,
 * T8b: replace the jittered per-cell hash grid with ordered, equal-width
 * columns — see `item-layout.ts`). Pure function of the viewport's CSS
 * width, so it naturally recomputes on resize with no special-case handling
 * needed: the caller (`item-layout.ts`'s `visibleCardInstances`, invoked
 * every frame from `engine.ts`) already recomputes the layout from the
 * current viewport size every frame.
 */

/**
 * Constant gutter used for BOTH the horizontal gap between columns and the
 * vertical gap between stacked cards (owner feedback: horizontal separation
 * was fine, vertical was irregular — using the SAME constant for both axes
 * removes the irregularity instead of retuning either one).
 *
 * Derived from the previous per-cell grid's own effective horizontal gap, so
 * the "fine" horizontal spacing carries over unchanged: a cell was 340
 * world px wide and a card's width was `cellSize * fraction`, `fraction`
 * uniform in [0.55, 0.86] (mean 0.705, i.e. a "typical" card width of
 * ~240px). A card centered in its cell (no jitter) left
 * `cellSize - typicalWidth` of total gap to its neighbor:
 * 340 - 340*0.705 = 340*0.295 ≈ 100px.
 */
export const COLUMN_GUTTER_PX = 100;

/** Column width is clamped into this range regardless of viewport size, so extreme viewports never produce a degenerate (near-zero or absurdly wide) column. */
export const MIN_COLUMN_WIDTH_PX = 140;
export const MAX_COLUMN_WIDTH_PX = 420;

/**
 * Column-count breakpoints (viewport CSS width below `maxWidth` -> column
 * count), checked in ascending order; a width at or above every listed
 * `maxWidth` falls through to `DEFAULT_COLUMN_COUNT`. Chosen so 1440px
 * (desktop) lands on 5 columns (within the requested 4-6) and 390px
 * (mobile) lands on 2 (the requested ~2), each an exact tiling of the
 * viewport width (`columns * columnWidth + (columns - 1) * COLUMN_GUTTER_PX
 * === width`) before the min/max width clamp.
 */
const COLUMN_COUNT_BREAKPOINTS: ReadonlyArray<{ maxWidth: number; columns: number }> = [
  { maxWidth: 480, columns: 2 },
  { maxWidth: 900, columns: 3 },
  { maxWidth: 1200, columns: 4 },
  { maxWidth: 1680, columns: 5 },
];
const DEFAULT_COLUMN_COUNT = 6;

function columnCountForWidth(viewportCssWidth: number): number {
  for (const breakpoint of COLUMN_COUNT_BREAKPOINTS) {
    if (viewportCssWidth < breakpoint.maxWidth) {
      return breakpoint.columns;
    }
  }
  return DEFAULT_COLUMN_COUNT;
}

export interface ColumnLayout {
  /** How many columns this viewport width targets (informational — the layout itself is infinite in both axes; this only drives `columnWidth`). */
  columns: number;
  /** World-px width of every column (equal-width, no jitter, no random size scaling — see `item-layout.ts`). */
  columnWidth: number;
  /** `columnWidth + COLUMN_GUTTER_PX` — the periodic horizontal distance from one column's left edge to the next. */
  columnStride: number;
}

/** Pure: the column geometry for a given viewport CSS width. Clamped so degenerate viewport sizes never produce a non-positive column width. */
export function columnLayoutFor(viewportCssWidth: number): ColumnLayout {
  const width = Math.max(viewportCssWidth, 1);
  const columns = columnCountForWidth(width);
  const rawColumnWidth = (width - (columns - 1) * COLUMN_GUTTER_PX) / columns;
  const columnWidth = clamp(rawColumnWidth, MIN_COLUMN_WIDTH_PX, MAX_COLUMN_WIDTH_PX);
  return { columns, columnWidth, columnStride: columnWidth + COLUMN_GUTTER_PX };
}
