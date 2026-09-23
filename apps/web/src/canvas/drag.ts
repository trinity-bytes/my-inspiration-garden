import type { Vec2 } from "./types";

export interface DragSample {
  x: number;
  y: number;
  /** Seconds, monotonically increasing across samples. */
  t: number;
}

/** Velocity from the last two drag samples, used as the release inertia. */
export function releaseVelocity(samples: readonly DragSample[]): Vec2 {
  if (samples.length < 2) {
    return { x: 0, y: 0 };
  }
  const last = samples[samples.length - 1] as DragSample;
  const prev = samples[samples.length - 2] as DragSample;
  const dt = last.t - prev.t;
  if (dt <= 0) {
    return { x: 0, y: 0 };
  }
  return { x: (last.x - prev.x) / dt, y: (last.y - prev.y) / dt };
}

/** Exponential decay toward zero, parameterized by half-life in seconds. */
export function decayVelocity(velocity: Vec2, dt: number, halfLifeSeconds: number): Vec2 {
  if (halfLifeSeconds <= 0) {
    return { x: 0, y: 0 };
  }
  const factor = 2 ** (-dt / halfLifeSeconds);
  return { x: velocity.x * factor, y: velocity.y * factor };
}
