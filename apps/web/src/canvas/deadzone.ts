/**
 * The dead-zone is the circle around the viewport center inside which
 * cursor movement does not drive drift (garden-mvp.md "Canvas": "~100px
 * diameter, responsive").
 */
export const DEAD_ZONE_MIN_PX = 64;
export const DEAD_ZONE_MAX_PX = 120;
export const DEAD_ZONE_VIEWPORT_FACTOR = 0.07;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Dead-zone diameter in CSS px, responsive to viewport size. */
export function deadZoneDiameter(viewportWidth: number, viewportHeight: number): number {
  const base = DEAD_ZONE_VIEWPORT_FACTOR * Math.min(viewportWidth, viewportHeight);
  return clamp(base, DEAD_ZONE_MIN_PX, DEAD_ZONE_MAX_PX);
}

export function deadZoneRadius(viewportWidth: number, viewportHeight: number): number {
  return deadZoneDiameter(viewportWidth, viewportHeight) / 2;
}
