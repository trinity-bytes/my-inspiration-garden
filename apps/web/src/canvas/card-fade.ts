import { PHONE_MAX_WIDTH_PX } from "./column-layout";
import { worldToScreen } from "./coords";
import type { CardWorldRect } from "./item-layout";
import { clamp01, smoothstep } from "./navigation";
import type { Vec2 } from "./types";

/**
 * Card visibility at the viewport edge: purely spatial (no per-card timer or
 * mutable animation state — cards are pooled and reassigned to different
 * items every frame), so opacity is a function of where a card sits relative
 * to the viewport edge right now. Desktop has no fade: a card is solid as
 * soon as any of it is on screen. Phones keep a short fade as cards enter
 * and leave (see `PHONE_ENTRY_BAND_PX`).
 */

/** A card's on-screen bounding rect, CSS px, y-down, relative to the viewport center (`ScreenRect`). */
export interface CardScreenRect {
  center: Vec2;
  halfWidth: number;
  halfHeight: number;
}

export function cardScreenRect(
  worldRect: CardWorldRect,
  worldOffset: Vec2,
  parallax: number,
): CardScreenRect {
  return {
    center: worldToScreen({ x: worldRect.x, y: worldRect.y }, worldOffset, parallax),
    halfWidth: worldRect.width / 2,
    halfHeight: worldRect.height / 2,
  };
}

/**
 * On phones the ramp is capped to this many visible px (owner feedback,
 * 2026-10-29): with only ~2 columns on screen,
 * a shrinking, fading frame read as "the canvas ends here". A short fade
 * lets cards be cut by the screen edge, which reads as "it keeps going".
 */
export const PHONE_ENTRY_BAND_PX = 40;

/**
 * Per axis, in [0, 1]: 0 when the card lies entirely past the viewport edge.
 * On phones it ramps linearly to 1 across the first `PHONE_ENTRY_BAND_PX`
 * visible px; on desktop it is 1 as soon as the card is on screen. The
 * most-faded axis wins.
 */
export function cardEntryProgress(
  rect: CardScreenRect,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const band = viewportWidth < PHONE_MAX_WIDTH_PX ? PHONE_ENTRY_BAND_PX : 0;
  const progressX = axisProgress(rect.center.x, rect.halfWidth, viewportWidth / 2, band);
  const progressY = axisProgress(rect.center.y, rect.halfHeight, viewportHeight / 2, band);
  return Math.min(progressX, progressY);
}

function axisProgress(
  center: number,
  halfSize: number,
  halfViewport: number,
  band: number,
): number {
  const extent = halfSize * 2;
  const visible = halfViewport - Math.abs(center) + halfSize;
  // No band (desktop) or a zero-size rect leaves nothing to ramp over.
  const ramp = Math.min(extent, band);
  if (ramp <= 0) return visible > 0 ? 1 : 0;
  return clamp01(visible / ramp);
}

/**
 * Final opacity for `progress` (see `cardEntryProgress`). Eased with the
 * same `smoothstep` the navigation drift curve uses, for a consistent feel.
 * `prefers-reduced-motion` (see `reduced-motion.ts`) replaces the ramp with
 * an instant step — no animated transition, matching the ambient-motion
 * suppression `motionPolicyFor` already applies elsewhere.
 */
export function cardOpacity(progress: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return progress > 0 ? 1 : 0;
  }
  return smoothstep(progress);
}
