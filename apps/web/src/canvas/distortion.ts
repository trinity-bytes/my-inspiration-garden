import type { Vec2 } from "./types";

/**
 * Subtle spherical-feel barrel distortion applied as a full-screen
 * post-process (see `post/barrel.ts`). `k` is small on purpose — content
 * should barely bend. The pass is uniform across every layer; faster
 * (nearer) layers only *look* more bent because they sweep through the
 * curved edge faster.
 */
export const DEFAULT_BARREL_K = 0.045;

/**
 * Per-axis factor from plain NDC to lens space, whose unit is half the
 * viewport's SHORTER side (on portrait phones a lens measured in heights
 * barely reaches the side edges). Landscape keeps the height as the unit;
 * portrait bends its side edges like a desktop's top edge.
 */
export function lensScale(viewport: { width: number; height: number }): Vec2 {
  const aspect = viewport.width / Math.max(viewport.height, 1);
  return { x: Math.max(aspect, 1), y: Math.max(1 / aspect, 1) };
}

/** Forward barrel distortion in normalized device-ish space (centered at 0). */
export function barrelForward(p: Vec2, k: number): Vec2 {
  const r2 = p.x * p.x + p.y * p.y;
  const factor = 1 + k * r2;
  return { x: p.x * factor, y: p.y * factor };
}

/**
 * Inverse of `barrelForward`, solved by Newton iteration on the radius
 * (the mapping is radially symmetric: `r_d = r_u * (1 + k * r_u^2)`).
 * Used to map a pointer position through the distortion to world
 * space for hit-testing.
 */
export function barrelInverse(p: Vec2, k: number, iterations = 8): Vec2 {
  const rd = Math.hypot(p.x, p.y);
  if (rd === 0 || k === 0) {
    return { x: p.x, y: p.y };
  }

  let ru = rd;
  for (let i = 0; i < iterations; i++) {
    const f = ru * (1 + k * ru * ru) - rd;
    const fPrime = 1 + 3 * k * ru * ru;
    ru -= f / fPrime;
  }

  const scale = ru / rd;
  return { x: p.x * scale, y: p.y * scale };
}
