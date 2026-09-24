import { describe, expect, it } from "vitest";
import { CLICK_DRAG_THRESHOLD_PX } from "../../src/canvas/click-vs-drag";
import {
  IDLE_POINTER_GESTURE,
  isPointerGesturePressed,
  pointerGestureDown,
  pointerGestureReset,
  pointerGestureUp,
} from "../../src/canvas/pointer-gesture";

describe("pointer-gesture", () => {
  it("starts idle (not pressed)", () => {
    expect(isPointerGesturePressed(IDLE_POINTER_GESTURE)).toBe(false);
  });

  it("pointerGestureDown marks the gesture as pressed", () => {
    const state = pointerGestureDown({ x: 10, y: 20 });
    expect(isPointerGesturePressed(state)).toBe(true);
  });

  it("pointerGestureUp within the click threshold reports a click and returns to idle", () => {
    const pressed = pointerGestureDown({ x: 100, y: 100 });
    const result = pointerGestureUp(pressed, { x: 101, y: 100 });
    expect(result.isClick).toBe(true);
    expect(isPointerGesturePressed(result.state)).toBe(false);
  });

  it("pointerGestureUp past the click threshold reports a drag (no click) and returns to idle", () => {
    const pressed = pointerGestureDown({ x: 0, y: 0 });
    const result = pointerGestureUp(pressed, { x: CLICK_DRAG_THRESHOLD_PX + 1, y: 0 });
    expect(result.isClick).toBe(false);
    expect(isPointerGesturePressed(result.state)).toBe(false);
  });

  it("pointerGestureUp with no matching down never reports a click", () => {
    const result = pointerGestureUp(IDLE_POINTER_GESTURE, { x: 0, y: 0 });
    expect(result.isClick).toBe(false);
    expect(isPointerGesturePressed(result.state)).toBe(false);
  });

  it("pointerGestureReset always returns to idle, regardless of prior state", () => {
    const pressed = pointerGestureDown({ x: 5, y: 5 });
    expect(isPointerGesturePressed(pointerGestureReset())).toBe(false);
    expect(isPointerGesturePressed(pointerGestureReset())).toBe(false);
    // Also from a pressed state (e.g. pointercancel / lostpointercapture
    // firing mid-gesture, such as a release outside the canvas).
    const afterReset = pointerGestureReset();
    expect(isPointerGesturePressed(afterReset)).toBe(false);
    expect(pressed).not.toBe(afterReset);
  });

  it("a stray pointerup after a reset (e.g. release already handled via lostpointercapture) is not a click", () => {
    pointerGestureDown({ x: 0, y: 0 });
    const resetState = pointerGestureReset();
    const result = pointerGestureUp(resetState, { x: 0, y: 0 });
    expect(result.isClick).toBe(false);
  });

  it("accepts a custom threshold, matching isClick's own contract", () => {
    const pressed = pointerGestureDown({ x: 0, y: 0 });
    expect(pointerGestureUp(pressed, { x: 20, y: 0 }, 25).isClick).toBe(true);
    expect(pointerGestureUp(pressed, { x: 20, y: 0 }, 10).isClick).toBe(false);
  });
});
