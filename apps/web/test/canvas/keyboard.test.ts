import { describe, expect, it } from "vitest";
import { directionForKey, isTextInputFocused, keyboardVelocity } from "../../src/canvas/keyboard";

describe("directionForKey", () => {
  it("maps arrow keys", () => {
    expect(directionForKey("ArrowUp")).toBe("up");
    expect(directionForKey("ArrowDown")).toBe("down");
    expect(directionForKey("ArrowLeft")).toBe("left");
    expect(directionForKey("ArrowRight")).toBe("right");
  });

  it("maps WASD case-insensitively", () => {
    expect(directionForKey("w")).toBe("up");
    expect(directionForKey("W")).toBe("up");
    expect(directionForKey("s")).toBe("down");
    expect(directionForKey("S")).toBe("down");
    expect(directionForKey("a")).toBe("left");
    expect(directionForKey("A")).toBe("left");
    expect(directionForKey("d")).toBe("right");
    expect(directionForKey("D")).toBe("right");
  });

  it("returns null for unrelated keys", () => {
    expect(directionForKey("Enter")).toBeNull();
    expect(directionForKey("q")).toBeNull();
    expect(directionForKey(" ")).toBeNull();
  });
});

describe("isTextInputFocused", () => {
  it("is false for null", () => {
    expect(isTextInputFocused(null)).toBe(false);
  });

  it("is false for a plain div", () => {
    const div = document.createElement("div");
    expect(isTextInputFocused(div)).toBe(false);
  });

  it("is true for an input", () => {
    const input = document.createElement("input");
    expect(isTextInputFocused(input)).toBe(true);
  });

  it("is true for a textarea", () => {
    const textarea = document.createElement("textarea");
    expect(isTextInputFocused(textarea)).toBe(true);
  });

  it("is true for a contentEditable element", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(isTextInputFocused(div)).toBe(true);
  });
});

describe("keyboardVelocity", () => {
  it("is zero with no active directions", () => {
    expect(keyboardVelocity(new Set(), 100)).toEqual({ x: 0, y: 0 });
  });

  it("moves left/right/up/down at full speed on a single axis", () => {
    expect(keyboardVelocity(new Set(["right"]), 100)).toEqual({ x: 100, y: 0 });
    expect(keyboardVelocity(new Set(["left"]), 100)).toEqual({ x: -100, y: 0 });
    expect(keyboardVelocity(new Set(["down"]), 100)).toEqual({ x: 0, y: 100 });
    expect(keyboardVelocity(new Set(["up"]), 100)).toEqual({ x: 0, y: -100 });
  });

  it("cancels opposite directions", () => {
    expect(keyboardVelocity(new Set(["left", "right"]), 100)).toEqual({ x: 0, y: 0 });
    expect(keyboardVelocity(new Set(["up", "down"]), 100)).toEqual({ x: 0, y: 0 });
  });

  it("normalizes diagonal movement to the configured speed", () => {
    const v = keyboardVelocity(new Set(["right", "down"]), 100);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(100, 5);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeGreaterThan(0);
  });
});
