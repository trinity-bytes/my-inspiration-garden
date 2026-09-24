import { screenToWorld, worldToScreen } from "./coords";
import { barrelForward, barrelInverse } from "./distortion";
import type { Vec2 } from "./types";

/**
 * Pointer screen px → world coords, exactly replicating the barrel
 * post-process shader's math (`shaders/barrel.ts`), so a click lands on the
 * same content the pointer visually appears over even though the whole
 * scene is bent by the distortion.
 *
 * The card layer (see `item-layout.ts`, `engine.ts`) uses parallax 1 (pans
 * 1:1 with navigation), so `screenToWorld`/`worldToScreen` at parallax 1
 * convert between "screen space" (the undistorted scene the world camera
 * renders, before the barrel pass) and a card's fixed world position.
 *
 * Derivation, matching `post/barrel.ts` + `shaders/barrel.ts` step by step:
 * 1. Browser pointer px (origin top-left, y down) → plain NDC (origin
 *    center, y up, matching WebGL clip space: `ndcY = 1 - 2*py/height`).
 * 2. Aspect-correct exactly like the shader (`u_aspect = width/height`,
 *    only the x axis is scaled) before applying the (inverse) barrel.
 * 3. Undo the aspect correction, then map plain NDC back to CSS px
 *    relative to the viewport center (the world camera's own frustum is
 *    `[-width/2, width/2] x [-height/2, height/2]`, no aspect correction of
 *    its own — see `engine.ts`'s `handleResize`).
 */

function viewportAspect(viewport: { width: number; height: number }): number {
  return viewport.width / Math.max(viewport.height, 1);
}

/** Pointer CSS px (relative to the canvas, origin top-left) → world position, through the inverse barrel distortion. */
export function pointerToWorld(
  pointerCss: Vec2,
  viewport: { width: number; height: number },
  worldOffset: Vec2,
  distortionK: number,
  cardParallax = 1,
): Vec2 {
  const ndcX = (pointerCss.x / viewport.width) * 2 - 1;
  const ndcY = 1 - (pointerCss.y / viewport.height) * 2;
  const aspect = viewportAspect(viewport);

  const worldNdc = barrelInverse({ x: ndcX * aspect, y: ndcY }, distortionK);
  const plainNdcX = worldNdc.x / aspect;

  const screen: Vec2 = {
    x: plainNdcX * (viewport.width / 2),
    y: -(worldNdc.y * (viewport.height / 2)),
  };
  return screenToWorld(screen, worldOffset, cardParallax);
}

/** The exact forward counterpart of `pointerToWorld`: world position → pointer CSS px, through the forward barrel distortion. */
export function worldToPointer(
  world: Vec2,
  viewport: { width: number; height: number },
  worldOffset: Vec2,
  distortionK: number,
  cardParallax = 1,
): Vec2 {
  const screen = worldToScreen(world, worldOffset, cardParallax);
  const aspect = viewportAspect(viewport);

  const plainNdcX = screen.x / (viewport.width / 2);
  const plainNdcY = -screen.y / (viewport.height / 2);

  const distorted = barrelForward({ x: plainNdcX * aspect, y: plainNdcY }, distortionK);
  const ndcX = distorted.x / aspect;
  const ndcY = distorted.y;

  return {
    x: ((ndcX + 1) / 2) * viewport.width,
    y: ((1 - ndcY) / 2) * viewport.height,
  };
}

export interface HitTestableCard {
  id: string;
  worldRect: { x: number; y: number; width: number; height: number };
}

function pointInRect(
  point: Vec2,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    Math.abs(point.x - rect.x) <= rect.width / 2 && Math.abs(point.y - rect.y) <= rect.height / 2
  );
}

/**
 * The topmost card under the pointer, or `null`. "Topmost" = last match in
 * `cards` (callers pass cards in draw order, matching the engine's render
 * order — see `layers/cards.ts`); by design cards rarely overlap (each is
 * confined to its own layout cell, see `item-layout.ts`), but the tie-break
 * is still well-defined.
 */
export function hitTestCard(
  pointerCss: Vec2,
  viewport: { width: number; height: number },
  worldOffset: Vec2,
  distortionK: number,
  cards: readonly HitTestableCard[],
): string | null {
  const world = pointerToWorld(pointerCss, viewport, worldOffset, distortionK);
  let hit: string | null = null;
  for (const card of cards) {
    if (pointInRect(world, card.worldRect)) {
      hit = card.id;
    }
  }
  return hit;
}
