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
  const fadeMargin = 140;

  it("is 1 when the card sits fully inside the viewport", () => {
    const rect = cardScreenRect({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0 }, 1);
    expect(cardEntryProgress(rect, viewportWidth, viewportHeight, fadeMargin)).toBe(1);
  });

  it("is 0 once the card is fadeMarginPx or more past the viewport edge", () => {
    const rect = cardScreenRect(
      { x: viewportWidth / 2 + 50 + fadeMargin, y: 0, width: 100, height: 100 },
      { x: 0, y: 0 },
      1,
    );
    expect(cardEntryProgress(rect, viewportWidth, viewportHeight, fadeMargin)).toBe(0);
  });

  it("ramps linearly between the viewport edge and the fade margin", () => {
    const halfway = fadeMargin / 2;
    const rect = cardScreenRect(
      { x: viewportWidth / 2 + 50 + halfway, y: 0, width: 100, height: 100 },
      { x: 0, y: 0 },
      1,
    );
    expect(cardEntryProgress(rect, viewportWidth, viewportHeight, fadeMargin)).toBeCloseTo(0.5, 5);
  });

  it("checks both axes: a card exceeding the margin vertically also fades even if horizontally centered", () => {
    const rect = cardScreenRect(
      { x: 0, y: viewportHeight / 2 + 50 + fadeMargin, width: 100, height: 100 },
      { x: 0, y: 0 },
      1,
    );
    expect(cardEntryProgress(rect, viewportWidth, viewportHeight, fadeMargin)).toBe(0);
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
