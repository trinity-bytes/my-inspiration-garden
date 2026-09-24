import { describe, expect, it } from "vitest";
import { cardEntryProgress, cardOpacity, cardScreenRect } from "../../src/canvas/card-fade";

describe("cardScreenRect", () => {
  it("centers the rect at the world position offset by the world offset (parallax 1)", () => {
    const rect = cardScreenRect({ x: 100, y: -50, width: 60, height: 40 }, { x: 10, y: 5 }, 1);
    expect(rect.center).toEqual({ x: 110, y: -45 });
    expect(rect.halfWidth).toBe(30);
    expect(rect.halfHeight).toBe(20);
  });
});

describe("cardEntryProgress", () => {
  const viewportWidth = 1000;
  const viewportHeight = 800;
  const inset = 80;
  const card = (x: number, y: number) =>
    cardScreenRect({ x, y, width: 100, height: 100 }, { x: 0, y: 0 }, 1);

  it("is 1 when the card sits well inside the viewport", () => {
    expect(cardEntryProgress(card(0, 0), viewportWidth, viewportHeight, inset)).toBe(1);
  });

  it("is 1 once the card's outer edge is fadeInsetPx inside the viewport edge", () => {
    expect(cardEntryProgress(card(500 - inset - 50, 0), viewportWidth, viewportHeight, inset)).toBe(
      1,
    );
  });

  it("is 0 when the card is entirely outside the viewport", () => {
    expect(cardEntryProgress(card(500 + 50, 0), viewportWidth, viewportHeight, inset)).toBe(0);
  });

  it("is visibly faded while the card is still on screen (the ramp happens where it can be seen)", () => {
    // Outer edge flush with the viewport edge: fully visible, still ramping.
    const flush = cardEntryProgress(card(500 - 50, 0), viewportWidth, viewportHeight, inset);
    expect(flush).toBeCloseTo(100 / 180, 5);
    // Half the card past the edge.
    const half = cardEntryProgress(card(500, 0), viewportWidth, viewportHeight, inset);
    expect(half).toBeCloseTo(50 / 180, 5);
    expect(half).toBeLessThan(flush);
  });

  it("applies the same ramp vertically and the most-faded axis wins", () => {
    expect(cardEntryProgress(card(0, 400), viewportWidth, viewportHeight, inset)).toBeCloseTo(
      50 / 180,
      5,
    );
    expect(cardEntryProgress(card(500, 400), viewportWidth, viewportHeight, inset)).toBeCloseTo(
      50 / 180,
      5,
    );
    expect(cardEntryProgress(card(450, 400), viewportWidth, viewportHeight, inset)).toBeCloseTo(
      50 / 180,
      5,
    );
  });
});

describe("cardOpacity", () => {
  it("smoothly ramps opacity with progress when motion is not reduced", () => {
    expect(cardOpacity(0, false)).toBe(0);
    expect(cardOpacity(1, false)).toBe(1);
    expect(cardOpacity(0.5, false)).toBeCloseTo(0.5, 5);
  });

  it("uses an instant step (no animated ramp) when reduced motion is requested", () => {
    expect(cardOpacity(0, true)).toBe(0);
    expect(cardOpacity(0.001, true)).toBe(1);
    expect(cardOpacity(1, true)).toBe(1);
  });
});
