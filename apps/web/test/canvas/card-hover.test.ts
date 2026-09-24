import { describe, expect, it } from "vitest";
import { cardHoverStyle } from "../../src/canvas/card-hover";

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
