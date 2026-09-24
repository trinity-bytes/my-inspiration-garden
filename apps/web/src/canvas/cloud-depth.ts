import { clamp } from "./deadzone";

/**
 * Depth is the single source of truth for the cloud aerial-perspective
 * effect (owner feedback, T8a): nearer (faster) clouds must read as
 * solid and always draw above farther (slower, hazier) ones, so speed,
 * stacking order and clarity all tell the same depth story.
 *
 * `depth` is normalized: 0 = farthest, 1 = nearest.
 */
export interface CloudDepthStyle {
  /** World units / second per world-offset unit; higher = faster parallax. */
  parallax: number;
  /** Base (pre-jitter) opacity; see `cloudOpacityRange` for the per-cell jittered band. */
  opacity: number;
  /** How much the sprite color mixes toward `ATMOSPHERE_COLOR_RGB`, in [0, 1]. 0 = no tint. */
  atmosphereMix: number;
  /** Multiplier applied to a layer's base sprite size. */
  sizeScale: number;
  /** Three.js `renderOrder`: strictly increasing with depth so nearer always draws on top. */
  renderOrder: number;
}

// T8b-2 owner feedback: retune the two remaining layers (far, mid) TOGETHER
// after the near layer's removal — slower, a little more atmospheric.
//
// T8b-3 owner feedback (second retune — "the motion still doesn't feel
// right", goal = realism): far/mid retuned AGAIN.
//   - Speed: real clouds barely outpace the sky they drift across, so
//     parallax is now judged against SKY_PARALLAX=0.05 (engine.ts) rather
//     than an arbitrary fraction of the old values — far 0.18->0.08, near
//     endpoint 0.48->0.25 (giving mid, at depth=0.3, ~0.13; see engine.ts's
//     CLOUD_DEPTH_MID below).
//   - Atmosphere: stronger — far opacity 0.55->0.45, atmosphereMix 0.5->0.65.
// OPACITY_NEAR/ATMOSPHERE_MIX_NEAR stay at their fully-solid boundary (no
// layer is placed at depth=1 anymore, but the generic mapping keeps that
// invariant) — mid's own retuned values come from CLOUD_DEPTH_MID
// (engine.ts, 0.4->0.3 this round) sampling closer to far on this same
// far/near curve, instead of re-deriving a second set of endpoints.
const PARALLAX_FAR = 0.08;
const PARALLAX_NEAR = 0.25;
const OPACITY_FAR = 0.45;
const OPACITY_NEAR = 1;
const ATMOSPHERE_MIX_FAR = 0.65;
const ATMOSPHERE_MIX_NEAR = 0;
const SIZE_SCALE_FAR = 0.85;
const SIZE_SCALE_NEAR = 1.2;
const RENDER_ORDER_SCALE = 100;

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

export function cloudDepthStyle(depth: number): CloudDepthStyle {
  const d = clamp(depth, 0, 1);
  return {
    parallax: lerp(PARALLAX_FAR, PARALLAX_NEAR, d),
    opacity: lerp(OPACITY_FAR, OPACITY_NEAR, d),
    atmosphereMix: lerp(ATMOSPHERE_MIX_FAR, ATMOSPHERE_MIX_NEAR, d),
    sizeScale: lerp(SIZE_SCALE_FAR, SIZE_SCALE_NEAR, d),
    renderOrder: d * RENDER_ORDER_SCALE,
  };
}

/**
 * Per-cell opacity jitter half-width for a layer at `depth`: shrinks to
 * exactly 0 at depth=1, so the nearest layer is always perfectly solid
 * (no cell ever reads as partially transparent). Farther layers keep a
 * small jitter for natural variation, sized so adjacent layers' bands
 * never overlap (see `cloudOpacityRange`).
 */
export function cloudOpacityJitterHalfWidth(depth: number): number {
  const d = clamp(depth, 0, 1);
  return 0.05 * (1 - d);
}

/** The [min, max] per-cell opacity band for a layer at `depth` (base opacity ± jitter, clamped to [0, 1]). */
export function cloudOpacityRange(depth: number): { min: number; max: number } {
  const d = clamp(depth, 0, 1);
  const { opacity } = cloudDepthStyle(d);
  const half = cloudOpacityJitterHalfWidth(d);
  return {
    min: clamp(opacity - half, 0, 1),
    max: clamp(opacity + half, 0, 1),
  };
}

/**
 * Shared atmosphere/sky tint that farther clouds mix toward (light
 * lavender, matching the design tokens' lavender-100 — see
 * `styles/tokens.css`). Kept as one constant so shaders and tests agree.
 */
export const ATMOSPHERE_COLOR_HEX = "#E9E3F3";
export const ATMOSPHERE_COLOR_RGB = { r: 0xe9 / 255, g: 0xe3 / 255, b: 0xf3 / 255 };
