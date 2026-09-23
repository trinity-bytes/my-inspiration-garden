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
