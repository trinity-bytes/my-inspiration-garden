import { describe, expect, it } from "vitest";
import { cardHoverStyle, HOVER_MAX_PAN_SPEED, visibleHoverKey } from "../../src/canvas/card-hover";

describe("cardHoverStyle", () => {
  it("lifts and highlights a hovered card", () => {
    const style = cardHoverStyle(true);
    expect(style.scale).toBeGreaterThan(1);
    expect(style.highlight).toBe(1);
  });

  it("is neutral for a non-hovered card", () => {
    expect(cardHoverStyle(false)).toEqual({ scale: 1, highlight: 0 });
  });
});

describe("visibleHoverKey", () => {
  it("shows the hovered card while the canvas is still or panning slowly", () => {
    expect(visibleHoverKey("card-1", { x: 0, y: 0 })).toBe("card-1");
    expect(visibleHoverKey("card-1", { x: HOVER_MAX_PAN_SPEED - 1, y: 0 })).toBe("card-1");
  });

  it("hides hover while panning fast, so cards sweeping under the cursor do not pop", () => {
    expect(visibleHoverKey("card-1", { x: HOVER_MAX_PAN_SPEED, y: HOVER_MAX_PAN_SPEED })).toBe(
      null,
    );
  });

  it("stays null when nothing is hovered", () => {
    expect(visibleHoverKey(null, { x: 0, y: 0 })).toBe(null);
  });
});

describe("cardHoverStyle allocation", () => {
  it("returns shared frozen styles, so per-frame callers never allocate", () => {
    expect(cardHoverStyle(true)).toBe(cardHoverStyle(true));
    expect(cardHoverStyle(false)).toBe(cardHoverStyle(false));
    expect(Object.isFrozen(cardHoverStyle(true))).toBe(true);
  });
});
