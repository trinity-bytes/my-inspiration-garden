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
 * Originally derived from the previous per-cell grid's own effective
 * horizontal gap (340*0.295 ≈ 100px — see prior revisions of this comment).
 * Reduced to 56 (T9b, owner feedback): both the horizontal gap between
 * columns and the vertical gap between stacked cards felt too spacious once
 * real per-kind card content (T9) was in place — one constant still drives
 * both axes, so tightening it removes the excess space uniformly instead of
 * retuning either axis independently.
 *
 * Halved to 28 (owner feedback, 2026-10-04): once the sky background was
 * replaced with a solid color, the empty space between cards read as too
 * wide.
 */
export const COLUMN_GUTTER_PX = 28;

/**
 * Gutter below `PHONE_MAX_WIDTH_PX` (F7, owner feedback 2026-10-29:
 * on phones the cards looked too far apart). Same rule as the desktop
 * gutter: one constant for both axes, per viewport.
 */
export const MOBILE_COLUMN_GUTTER_PX = 12;
/** Viewports narrower than this (CSS px) get the phone-specific canvas tuning (gutter, edge entry band). */
export const PHONE_MAX_WIDTH_PX = 480;

/** Column width is clamped into this range regardless of viewport size, so extreme viewports never produce a degenerate (near-zero or absurdly wide) column. */
export const MIN_COLUMN_WIDTH_PX = 140;
export const MAX_COLUMN_WIDTH_PX = 420;

/**
 * Column-count breakpoints (viewport CSS width below `maxWidth` -> column
 * count), checked in ascending order; a width at or above every listed
 * `maxWidth` falls through to `DEFAULT_COLUMN_COUNT`. Chosen so 1440px
 * (desktop) lands on 5 columns (within the requested 4-6) and 390px
 * (mobile) lands on `PHONE_VISIBLE_COLUMNS`, each an exact tiling of the
 * viewport width (`columns * columnWidth + (columns - 1) * COLUMN_GUTTER_PX
 * === width`) before the min/max width clamp.
 */
/**
 * Phones fit 2 full columns plus a peek of a third (owner feedback,
 * 2026-10-29): two columns tiling the width exactly left nothing cut at the
 * sides, so the canvas no longer read as continuing sideways.
 */
export const PHONE_VISIBLE_COLUMNS = 2.4;

const COLUMN_COUNT_BREAKPOINTS: ReadonlyArray<{ maxWidth: number; columns: number }> = [
  { maxWidth: PHONE_MAX_WIDTH_PX, columns: PHONE_VISIBLE_COLUMNS },
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
  /** Gap between columns and between stacked cards: `COLUMN_GUTTER_PX`, or `MOBILE_COLUMN_GUTTER_PX` on phones. */
  gutter: number;
  /** `columnWidth + gutter` — the periodic horizontal distance from one column's left edge to the next. */
  columnStride: number;
}

/** Pure: the column geometry for a given viewport CSS width. Clamped so degenerate viewport sizes never produce a non-positive column width. */
export function columnLayoutFor(viewportCssWidth: number): ColumnLayout {
  const width = Math.max(viewportCssWidth, 1);
  const columns = columnCountForWidth(width);
  const gutter = width < PHONE_MAX_WIDTH_PX ? MOBILE_COLUMN_GUTTER_PX : COLUMN_GUTTER_PX;
  const rawColumnWidth = (width - (columns - 1) * gutter) / columns;
  const columnWidth = clamp(rawColumnWidth, MIN_COLUMN_WIDTH_PX, MAX_COLUMN_WIDTH_PX);
  return { columns, columnWidth, gutter, columnStride: columnWidth + gutter };
}
