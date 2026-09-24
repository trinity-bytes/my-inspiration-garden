import { describe, expect, it } from "vitest";
import { CLICK_DRAG_THRESHOLD_PX, isClick } from "../../src/canvas/click-vs-drag";

describe("isClick", () => {
  it("is a click when the pointer barely moved", () => {
    expect(isClick({ x: 100, y: 100 }, { x: 101, y: 100 })).toBe(true);
  });

  it("is a click exactly at the threshold", () => {
    expect(isClick({ x: 0, y: 0 }, { x: CLICK_DRAG_THRESHOLD_PX, y: 0 })).toBe(true);
  });

  it("is not a click once the pointer moved past the threshold (it was a drag)", () => {
    expect(isClick({ x: 0, y: 0 }, { x: CLICK_DRAG_THRESHOLD_PX + 1, y: 0 })).toBe(false);
  });

  it("measures straight-line distance, not per-axis", () => {
    // 3-4-5 triangle: distance 5, well past a small threshold.
    expect(isClick({ x: 0, y: 0 }, { x: 3, y: 4 }, 4)).toBe(false);
    expect(isClick({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
  });

  it("accepts a custom threshold", () => {
    expect(isClick({ x: 0, y: 0 }, { x: 20, y: 0 }, 25)).toBe(true);
    expect(isClick({ x: 0, y: 0 }, { x: 20, y: 0 }, 10)).toBe(false);
  });
});
