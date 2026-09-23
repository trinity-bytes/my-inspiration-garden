import { worldToScreen } from "./coords";
import type { Vec2 } from "./types";

/** A cloud sprite's on-screen bounding rect, CSS px, y-down, relative to the viewport center. */
export interface ScreenRect {
  center: Vec2;
  halfWidth: number;
  halfHeight: number;
}

/**
 * The on-screen rect for a cloud placed at `worldPosition` (this engine's
 * y-down world convention — see `coords.ts`), given the sprite's CSS size
 * and the current navigation state. Pure; used both to render (indirectly,
 * via the same `worldToScreen` math clouds.ts/engine.ts apply) and to
 * verify placement actually lands on screen (see `rectOverlapsViewport`
 * and the T8a "clouds not rendering" bug: cells returned by
 * `visibleCellRange` don't individually guarantee an on-screen placement
 * when `cellSize` is large relative to the viewport — this pair of
 * functions makes that testable).
 */
export function cloudScreenRect(
  worldPosition: Vec2,
  spriteWidthPx: number,
  spriteHeightPx: number,
  worldOffset: Vec2,
  parallax: number,
): ScreenRect {
  return {
    center: worldToScreen(worldPosition, worldOffset, parallax),
    halfWidth: spriteWidthPx / 2,
    halfHeight: spriteHeightPx / 2,
  };
}

/** True if `rect` overlaps a viewport of the given CSS size, centered at (0, 0). Touching at the boundary counts as overlapping. */
export function rectOverlapsViewport(
  rect: ScreenRect,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const halfW = viewportWidth / 2;
  const halfH = viewportHeight / 2;
  return (
    rect.center.x - rect.halfWidth <= halfW &&
    rect.center.x + rect.halfWidth >= -halfW &&
    rect.center.y - rect.halfHeight <= halfH &&
    rect.center.y + rect.halfHeight >= -halfH
  );
}
