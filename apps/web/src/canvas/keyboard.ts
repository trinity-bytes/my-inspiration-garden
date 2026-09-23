import type { Vec2 } from "./types";

export type KeyDirection = "up" | "down" | "left" | "right";

const KEY_DIRECTIONS: Record<string, KeyDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  W: "up",
  s: "down",
  S: "down",
  a: "left",
  A: "left",
  d: "right",
  D: "right",
};

export function directionForKey(key: string): KeyDirection | null {
  return KEY_DIRECTIONS[key] ?? null;
}

/** True when the given element is (or behaves as) a text input; keyboard panning must not hijack it. */
export function isTextInputFocused(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
    return true;
  }
  // `isContentEditable` is not reliably implemented in jsdom's test
  // environment; the reflected `contentEditable` string property is.
  return target.contentEditable === "true" || target.isContentEditable === true;
}

/** Combined, normalized velocity from the set of currently held pan keys. */
export function keyboardVelocity(activeDirections: ReadonlySet<KeyDirection>, speed: number): Vec2 {
  let x = 0;
  let y = 0;
  if (activeDirections.has("left")) x -= 1;
  if (activeDirections.has("right")) x += 1;
  if (activeDirections.has("up")) y -= 1;
  if (activeDirections.has("down")) y += 1;

  const length = Math.hypot(x, y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: (x / length) * speed, y: (y / length) * speed };
}
