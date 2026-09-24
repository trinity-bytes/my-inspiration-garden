import type { Vec2 } from "./types";

/**
 * A pointer down→up gesture only opens a card (`onItemOpen`) if it barely
 * moved; anything past the threshold was a pan drag (see
 * `navigation-controller.ts`'s own drag handling) and must not also fire a
 * click. A small, fixed pixel threshold (not time-based) matches common
 * platform click-vs-drag heuristics and needs no extra state beyond the
 * pointerdown/pointerup positions the caller already has.
 */
export const CLICK_DRAG_THRESHOLD_PX = 6;

/** True if `start` → `end` moved no more than `thresholdPx` (straight-line distance). */
export function isClick(
  start: Vec2,
  end: Vec2,
  thresholdPx: number = CLICK_DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) <= thresholdPx;
}
