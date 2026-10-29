import { PHONE_MAX_WIDTH_PX } from "./column-layout";
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
 * An axis at most this wide (the phone breakpoint `column-layout.ts` also
 * uses) gets no inset: its columns fill it edge to edge, so any inset
 * would keep the outer cards translucent even at rest. The ramp then runs
 * only while a card pokes past the edge.
 */
export const NARROW_AXIS_MAX_PX = 480;

function defaultFadeInsetFor(viewportAxisSize: number): number {
  return viewportAxisSize <= NARROW_AXIS_MAX_PX ? 0 : DEFAULT_FADE_INSET_PX;
}

/**
 * On phones the ramp is capped to this many visible px (owner feedback,
 * 2026-10-29): with only ~2 columns on screen,
 * a shrinking, fading frame read as "the canvas ends here". A short fade
 * lets cards be cut by the screen edge, which reads as "it keeps going".
 */
export const PHONE_ENTRY_BAND_PX = 40;

function entryBandCapFor(viewportWidth: number): number {
  return viewportWidth < PHONE_MAX_WIDTH_PX ? PHONE_ENTRY_BAND_PX : Number.POSITIVE_INFINITY;
}

/**
 * Per axis, in [0, 1]: 0 when the card lies entirely past the viewport
 * edge, 1 once its outer edge is `fadeInsetPx` inside, ramping linearly in
 * between (so a card flush with the edge, or half past it, is visibly
 * translucent). On phones the ramp spans at most `PHONE_ENTRY_BAND_PX`
 * visible px. The most-faded axis wins. Without an explicit
 * `fadeInsetPx`, each axis picks its own (see `NARROW_AXIS_MAX_PX`).
 */
export function cardEntryProgress(
  rect: CardScreenRect,
  viewportWidth: number,
  viewportHeight: number,
  fadeInsetPx?: number,
): number {
  const insetX = fadeInsetPx ?? defaultFadeInsetFor(viewportWidth);
  const insetY = fadeInsetPx ?? defaultFadeInsetFor(viewportHeight);
  const bandCap = entryBandCapFor(viewportWidth);
  const progressX = axisProgress(rect.center.x, rect.halfWidth, viewportWidth / 2, insetX, bandCap);
  const progressY = axisProgress(
    rect.center.y,
    rect.halfHeight,
    viewportHeight / 2,
    insetY,
    bandCap,
  );
  return Math.min(progressX, progressY);
}

function axisProgress(
  center: number,
  halfSize: number,
  halfViewport: number,
  inset: number,
  bandCap: number,
): number {
  // Distance from the card's outer edge to the viewport edge; negative once it pokes out.
  const insideDepth = halfViewport - Math.abs(center) - halfSize;
  const extent = halfSize * 2;
  const denominator = Math.min(extent + Math.max(inset, 0), bandCap);
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
