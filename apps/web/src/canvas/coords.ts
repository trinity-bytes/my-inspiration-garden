import type { Vec2 } from "./types";

/**
 * The one coordinate convention for the whole canvas engine: world space is
 * screen-like — x right, y DOWN, 1 unit = 1 CSS px — matching the pointer,
 * drag and keyboard math in `navigation-controller.ts` (which are already
 * CSS/DOM convention: `clientY` grows downward). Every uniform (sky/haze
 * shaders) and every sprite position (clouds) must go through these two
 * functions so the sign convention never diverges between subsystems again
 * (see the T8a "Y axis inverted" correction: the previous sky/haze shaders
 * derived `screenPx` from clip-space, which is y-UP, and mixed it directly
 * with this y-DOWN `worldOffset`).
 *
 * `worldToScreen`/`screenToWorld` are exact inverses of each other for any
 * fixed `worldOffset`/`parallax` (see `screenToWorld(worldToScreen(p)) === p`
 * in the test suite).
 *
 * The `parallax` factor scales how much a layer reacts to `worldOffset`
 * (1 = tracks 1:1, as a "grabbed" foreground item should during a drag;
 * < 1 = distant/slow, as the ambient sky/haze/cloud layers are).
 */

/** World-space point (screen-like, y-down) → screen-space point relative to the viewport center (CSS px, y-down). */
export function worldToScreen(world: Vec2, worldOffset: Vec2, parallax: number): Vec2 {
  return {
    x: world.x + worldOffset.x * parallax,
    y: world.y + worldOffset.y * parallax,
  };
}

/** Screen-space point relative to the viewport center (CSS px, y-down) → world-space point. */
export function screenToWorld(screen: Vec2, worldOffset: Vec2, parallax: number): Vec2 {
  return {
    x: screen.x - worldOffset.x * parallax,
    y: screen.y - worldOffset.y * parallax,
  };
}

/**
 * The world offset that puts `worldPoint` exactly at the screen center for a
 * layer with the given `parallax` (`screenToWorld({x:0,y:0}, offset,
 * parallax) === worldPoint`). Used by T8b to pan-to-center a card (parallax
 * 1, the card layer tracks navigation 1:1) when it gains keyboard focus via
 * the parallel DOM/ARIA layer.
 */
export function centerOffsetFor(worldPoint: Vec2, parallax: number): Vec2 {
  // `|| 0` normalizes a `-0` result (e.g. worldPoint.x === 0) to `0`, so the
  // origin centers on itself as exactly `{ x: 0, y: 0 }`, not `{ x: -0, y:
  // -0 }` (both are numerically zero, but `toEqual` distinguishes them).
  return { x: -worldPoint.x / parallax || 0, y: -worldPoint.y / parallax || 0 };
}
