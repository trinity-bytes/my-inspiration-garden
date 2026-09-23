import type { Vec2 } from "./types";

/**
 * Frame-rate independent exponential smoothing: `v += (target - v) * (1 -
 * exp(-dt * k))`. Converges to the same trajectory regardless of the
 * timestep used to sample it.
 */
export function approach(current: number, target: number, dt: number, k: number): number {
  const t = 1 - Math.exp(-dt * k);
  return current + (target - current) * t;
}

export function approachVec2(current: Vec2, target: Vec2, dt: number, k: number): Vec2 {
  return {
    x: approach(current.x, target.x, dt, k),
    y: approach(current.y, target.y, dt, k),
  };
}
