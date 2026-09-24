import { worldToScreen } from "./coords";
import type { CardWorldRect } from "./item-layout";
import { clamp01, smoothstep } from "./navigation";
import type { Vec2 } from "./types";

/**
 * Fade transparent → solid entering view: purely spatial (no per-card timer
 * or mutable animation state — cards are pooled and reassigned to different
 * items every frame, like `layers/clouds.ts`), so opacity is a function of
 * where a card sits relative to the viewport edge right now. The ramp runs
 * across the visible edge band — a card entirely outside is transparent, a
 * card whose outer edge is `fadeInsetPx` inside the viewport is solid — so
 * the fade is actually seen as cards enter and leave the screen.
 */

/** A card's on-screen bounding rect, CSS px, y-down, relative to the viewport center — same shape as `cloud-screen-rect.ts`'s `ScreenRect`. */
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

/** How far inside the viewport edge a card's outer edge must be before it is fully solid. */
export const DEFAULT_FADE_INSET_PX = 80;

/**
 * Per axis, in [0, 1]: 0 when the card lies entirely past the viewport
 * edge, 1 once its outer edge is `fadeInsetPx` inside, ramping linearly in
 * between (so a card flush with the edge, or half past it, is visibly
 * translucent). The most-faded axis wins.
 */
export function cardEntryProgress(
  rect: CardScreenRect,
  viewportWidth: number,
  viewportHeight: number,
  fadeInsetPx: number = DEFAULT_FADE_INSET_PX,
): number {
  const progressX = axisProgress(rect.center.x, rect.halfWidth, viewportWidth / 2, fadeInsetPx);
  const progressY = axisProgress(rect.center.y, rect.halfHeight, viewportHeight / 2, fadeInsetPx);
  return Math.min(progressX, progressY);
}

function axisProgress(
  center: number,
  halfSize: number,
  halfViewport: number,
  inset: number,
): number {
  // Distance from the card's outer edge to the viewport edge; negative once it pokes out.
  const insideDepth = halfViewport - Math.abs(center) - halfSize;
  const extent = halfSize * 2;
  return clamp01((insideDepth + extent) / (extent + Math.max(inset, 0)));
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
