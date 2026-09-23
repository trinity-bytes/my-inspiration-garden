import { clamp } from "./deadzone";
import type { Vec2 } from "./types";

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Standard smoothstep easing over [0, 1], clamped outside that range. */
export function smoothstep(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

/**
 * Distance from the origin to the edge of an axis-aligned box (half-extents
 * halfW/halfH) along a unit direction, via a ray/box parametric intersection.
 * Used so "max speed at the viewport edge" holds in every direction, not
 * only along the axes.
 */
function edgeDistance(dirX: number, dirY: number, halfW: number, halfH: number): number {
  const tx = dirX !== 0 ? halfW / Math.abs(dirX) : Number.POSITIVE_INFINITY;
  const ty = dirY !== 0 ? halfH / Math.abs(dirY) : Number.POSITIVE_INFINITY;
  return Math.min(tx, ty);
}

export interface DriftTargetInput {
  /** Pointer position relative to the viewport center, in CSS px. */
  pointerX: number;
  pointerY: number;
  viewportWidth: number;
  viewportHeight: number;
  deadZoneRadius: number;
  /** World units / second reached at the viewport edge. */
  maxSpeed: number;
}

/**
 * Target drift velocity for the cursor-drift navigation mode: zero inside
 * the dead zone, growing via smoothstep easing up to `maxSpeed` at the
 * viewport edge, pointing away from center in the pointer's direction.
 */
export function computeDriftVelocity(input: DriftTargetInput): Vec2 {
  const {
    pointerX,
    pointerY,
    viewportWidth,
    viewportHeight,
    deadZoneRadius: deadZone,
    maxSpeed,
  } = input;
  const distance = Math.hypot(pointerX, pointerY);
  if (distance === 0 || distance <= deadZone) {
    return { x: 0, y: 0 };
  }

  const dirX = pointerX / distance;
  const dirY = pointerY / distance;
  const edge = edgeDistance(dirX, dirY, viewportWidth / 2, viewportHeight / 2);
  const denominator = Math.max(edge - deadZone, 1e-6);
  const progress = clamp01((distance - deadZone) / denominator);
  const speed = maxSpeed * smoothstep(progress);

  return { x: dirX * speed, y: dirY * speed };
}
