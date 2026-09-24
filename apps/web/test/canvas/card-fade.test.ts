import { describe, expect, it } from "vitest";
import {
  cardEntryProgress,
  cardEntryScale,
  cardOpacity,
  cardScreenRect,
  entryScaledWorldRect,
  MIN_ENTRY_SCALE,
} from "../../src/canvas/card-fade";

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

describe("cardEntryScale (watch-face style grow/shrink at the edges)", () => {
  it("is full size once the card is fully entered", () => {
    expect(cardEntryScale(1, false)).toBe(1);
  });

  it("shrinks to MIN_ENTRY_SCALE for a card that has not entered yet", () => {
    expect(MIN_ENTRY_SCALE).toBeGreaterThan(0.4);
    expect(MIN_ENTRY_SCALE).toBeLessThan(0.8);
    expect(cardEntryScale(0, false)).toBeCloseTo(MIN_ENTRY_SCALE, 10);
  });

  it("grows monotonically with the same eased ramp as the opacity", () => {
    const mid = cardEntryScale(0.5, false);
    expect(mid).toBeCloseTo(MIN_ENTRY_SCALE + (1 - MIN_ENTRY_SCALE) * cardOpacity(0.5, false), 10);
    expect(cardEntryScale(0.25, false)).toBeLessThan(mid);
    expect(cardEntryScale(0.75, false)).toBeGreaterThan(mid);
  });

  it("never scales under reduced motion", () => {
    expect(cardEntryScale(0, true)).toBe(1);
    expect(cardEntryScale(0.3, true)).toBe(1);
  });
});

describe("entryScaledWorldRect", () => {
  const viewport = { width: 1000, height: 800 };
  const origin = { x: 0, y: 0 };

  it("keeps a fully entered card unchanged", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(entryScaledWorldRect(rect, origin, viewport, false)).toEqual(rect);
  });

  it("shrinks an edge card around its own center, matching what is rendered", () => {
    const rect = { x: 450, y: 0, width: 100, height: 100 };
    const progress = cardEntryProgress(
      cardScreenRect(rect, origin, 1),
      viewport.width,
      viewport.height,
    );
    const scale = cardEntryScale(progress, false);
    const scaled = entryScaledWorldRect(rect, origin, viewport, false);
    expect(scale).toBeLessThan(1);
    expect(scaled.x).toBe(450);
    expect(scaled.y).toBe(0);
    expect(scaled.width).toBeCloseTo(100 * scale, 10);
    expect(scaled.height).toBeCloseTo(100 * scale, 10);
  });

  it("does not shrink under reduced motion", () => {
    const rect = { x: 450, y: 0, width: 100, height: 100 };
    expect(entryScaledWorldRect(rect, origin, viewport, true)).toEqual(rect);
  });
});
