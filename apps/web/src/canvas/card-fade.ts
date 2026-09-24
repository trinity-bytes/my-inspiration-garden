import { worldToScreen } from "./coords";
import type { CardWorldRect } from "./item-layout";
import { clamp01, smoothstep } from "./navigation";
import type { Vec2 } from "./types";

/**
 * Fade transparent → solid entering view: purely spatial (no per-card timer
 * or mutable animation state — cards are pooled and reassigned to different
 * items every frame, like `layers/clouds.ts`), so opacity is a function of
 * how deep a card sits inside the viewport right now. A card at the outer
 * edge of the virtualization margin (see `item-layout.ts`'s `marginCells`)
 * is fully transparent; a card fully inside the viewport is fully solid;
 * in between it ramps.
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

/** Matches the render margin cards get before popping into existence (see `item-layout.ts`'s `CARD_CELL_SIZE * DEFAULT_CARD_MARGIN_CELLS`, kept independent so the fade band can be tuned without moving the virtualization boundary). */
export const DEFAULT_FADE_MARGIN_PX = 140;

/**
 * How far "inside" the viewport a card is, in [0, 1]: 1 = fully inside the
 * viewport rect, 0 = the card's nearest point is `fadeMarginPx` or more
 * past the viewport edge, ramping linearly in between. Checked
 * independently on both axes (the larger overshoot wins), so a card
 * exceeding the margin on either axis fades out.
 */
export function cardEntryProgress(
  rect: CardScreenRect,
  viewportWidth: number,
  viewportHeight: number,
  fadeMarginPx: number = DEFAULT_FADE_MARGIN_PX,
): number {
  const halfW = viewportWidth / 2;
  const halfH = viewportHeight / 2;
  const overshootX = Math.max(0, Math.abs(rect.center.x) - rect.halfWidth - halfW);
  const overshootY = Math.max(0, Math.abs(rect.center.y) - rect.halfHeight - halfH);
  const overshoot = Math.max(overshootX, overshootY);

  if (fadeMarginPx <= 0) {
    return overshoot > 0 ? 0 : 1;
  }
  return clamp01(1 - overshoot / fadeMarginPx);
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
