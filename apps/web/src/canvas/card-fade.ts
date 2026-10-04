import { worldToScreen } from "./coords";
import type { CardWorldRect } from "./item-layout";
import { clamp01, smoothstep } from "./navigation";
import type { Vec2 } from "./types";

/**
 * Fade transparent → solid entering view: purely spatial (no per-card timer
 * or mutable animation state — cards are pooled and reassigned to different
 * items every frame), so opacity is a function of
 * where a card sits relative to the viewport edge right now. The ramp runs
 * across the visible edge band — a card entirely outside is transparent, a
 * card whose outer edge is `fadeInsetPx` inside the viewport is solid — so
 * the fade is actually seen as cards enter and leave the screen.
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
  const denominator = extent + Math.max(inset, 0);
  if (denominator <= 0) {
    // Degenerate: a zero-size rect (extent === 0) combined with a
    // non-positive fade inset leaves nothing to ramp over — the raw
    // formula would divide by zero (± Infinity, or exactly 0/0 => NaN when
    // the rect sits precisely on the viewport edge). Treat the point as
    // fully entered once it is inside the viewport, fully exited otherwise.
    return insideDepth >= 0 ? 1 : 0;
  }
  return clamp01((insideDepth + extent) / denominator);
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

/**
 * Smallest scale a card shrinks to at the viewport edge — the smartwatch
 * app-grid feel: cards grow to full size as they enter and shrink as they
 * leave, on the same ramp as the opacity.
 */
export const MIN_ENTRY_SCALE = 0.6;

/** Size multiplier for `progress` (see `cardEntryProgress`); reduced motion keeps cards at full size. */
export function cardEntryScale(progress: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return 1;
  }
  return MIN_ENTRY_SCALE + (1 - MIN_ENTRY_SCALE) * smoothstep(progress);
}

/**
 * The entry scale for a card at `worldRect` right now (see `cardEntryScale`)
 * — the single function BOTH rendering (`layers/cards.ts`) and hit-testing
 * (`entryScaledWorldRect`, used by `engine.ts`'s `hitTestableCards`) call,
 * so a shrunk edge card is always clickable exactly where it is drawn. T9
 * carried follow-up (T8b): previously each site independently chained
 * `cardScreenRect` -> `cardEntryProgress` -> `cardEntryScale` with the same
 * arguments — mathematically equal, but a future edit to one call site
 * could silently diverge from the other. Extracting this one function (and
 * having `entryScaledWorldRect` below call it, and `layers/cards.ts` call
 * it directly) makes that divergence structurally impossible.
 */
export function entryScaleForCard(
  worldRect: CardWorldRect,
  worldOffset: Vec2,
  viewport: { width: number; height: number },
  reducedMotion: boolean,
): number {
  const progress = cardEntryProgress(
    cardScreenRect(worldRect, worldOffset, 1),
    viewport.width,
    viewport.height,
  );
  return cardEntryScale(progress, reducedMotion);
}

/**
 * The card's world rect shrunk around its own center by its entry scale —
 * the single source of truth shared by rendering (`layers/cards.ts`) and
 * hit-testing, so a shrunk edge card is only clickable where it is drawn.
 */
export function entryScaledWorldRect(
  worldRect: CardWorldRect,
  worldOffset: Vec2,
  viewport: { width: number; height: number },
  reducedMotion: boolean,
): CardWorldRect {
  const scale = entryScaleForCard(worldRect, worldOffset, viewport, reducedMotion);
  if (scale === 1) {
    return worldRect;
  }
  return { ...worldRect, width: worldRect.width * scale, height: worldRect.height * scale };
}
