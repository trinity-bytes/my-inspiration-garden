import { describe, expect, it } from "vitest";
import {
  cardEntryProgress,
  cardOpacity,
  cardScreenRect,
  PHONE_ENTRY_BAND_PX,
} from "../../src/canvas/card-fade";

describe("cardScreenRect", () => {
  it("centers the rect at the world position offset by the world offset (parallax 1)", () => {
    const rect = cardScreenRect({ x: 100, y: -50, width: 60, height: 40 }, { x: 10, y: 5 }, 1);
    expect(rect.center).toEqual({ x: 110, y: -45 });
    expect(rect.halfWidth).toBe(30);
    expect(rect.halfHeight).toBe(20);
  });
});

describe("cardEntryProgress on desktop (no edge fade)", () => {
  const viewportWidth = 1000;
  const viewportHeight = 800;
  const card = (x: number, y: number) =>
    cardScreenRect({ x, y, width: 100, height: 100 }, { x: 0, y: 0 }, 1);

  it("is 1 when the card sits well inside the viewport", () => {
    expect(cardEntryProgress(card(0, 0), viewportWidth, viewportHeight)).toBe(1);
  });

  it("stays solid while the card is cut by any edge of the viewport", () => {
    expect(cardEntryProgress(card(500 - 50, 0), viewportWidth, viewportHeight)).toBe(1);
    expect(cardEntryProgress(card(500, 0), viewportWidth, viewportHeight)).toBe(1);
    expect(cardEntryProgress(card(500 + 49, 0), viewportWidth, viewportHeight)).toBe(1);
    expect(cardEntryProgress(card(0, 400 + 49), viewportWidth, viewportHeight)).toBe(1);
  });

  it("is 0 when the card is entirely outside the viewport", () => {
    expect(cardEntryProgress(card(500 + 50, 0), viewportWidth, viewportHeight)).toBe(0);
    expect(cardEntryProgress(card(0, -400 - 50), viewportWidth, viewportHeight)).toBe(0);
  });
});

describe("cardEntryProgress on a phone in portrait", () => {
  // Phone portrait: 189px cards on a 390px-wide screen.
  const phoneWidth = 390;
  const phoneHeight = 844;
  const card = (x: number, y: number) =>
    cardScreenRect({ x, y, width: 189, height: 189 }, { x: 0, y: 0 }, 1);

  it("is fully entered once a card is flush with the edge", () => {
    expect(cardEntryProgress(card(195 - 94.5, 0), phoneWidth, phoneHeight)).toBe(1);
  });

  it("ramps only across the last PHONE_ENTRY_BAND_PX of a card poking past the edge", () => {
    expect(cardEntryProgress(card(195, 0), phoneWidth, phoneHeight)).toBe(1);
    expect(cardEntryProgress(card(195 + 94.5 - 20, 0), phoneWidth, phoneHeight)).toBeCloseTo(
      0.5,
      5,
    );
    expect(cardEntryProgress(card(195 + 94.5, 0), phoneWidth, phoneHeight)).toBe(0);
  });

  it("uses the same band on the taller axis", () => {
    expect(cardEntryProgress(card(0, 422 - 94.5), phoneWidth, phoneHeight)).toBe(1);
    expect(cardEntryProgress(card(0, 422 + 94.5 - 20), phoneWidth, phoneHeight)).toBeCloseTo(
      0.5,
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

// T9 carried follow-up (T8b): axisProgress must not divide by zero for a
// degenerate zero-size rect combined with a non-positive fade inset.
describe("cardEntryProgress with a degenerate zero-size rect (guard against NaN/Infinity)", () => {
  const viewportWidth = 1000;
  const viewportHeight = 800;

  it("is finite (not NaN/Infinity) for a zero-size rect inside the viewport", () => {
    const rect = cardScreenRect({ x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0 }, 1);
    const progress = cardEntryProgress(rect, viewportWidth, viewportHeight);
    expect(Number.isFinite(progress)).toBe(true);
    expect(progress).toBe(1);
  });

  it("is finite (not NaN/Infinity) for a zero-size rect outside the viewport", () => {
    const rect = cardScreenRect({ x: 5000, y: 0, width: 0, height: 0 }, { x: 0, y: 0 }, 1);
    const progress = cardEntryProgress(rect, viewportWidth, viewportHeight);
    expect(Number.isFinite(progress)).toBe(true);
    expect(progress).toBe(0);
  });

  it("is finite (not NaN) for a zero-size rect sitting exactly on the viewport edge (0/0 case)", () => {
    // center.x === halfViewport exactly: insideDepth === 0 and extent === 0,
    // so the raw formula divides 0 by 0.
    const rect = cardScreenRect({ x: 500, y: 0, width: 0, height: 0 }, { x: 0, y: 0 }, 1);
    const progress = cardEntryProgress(rect, viewportWidth, viewportHeight);
    expect(Number.isNaN(progress)).toBe(false);
    expect(Number.isFinite(progress)).toBe(true);
  });
});

describe("card entry on phones (short fade, no grow/shrink)", () => {
  const phone = { width: 390, height: 844 };
  // A tall card in a phone layout with `visible` px of it showing below the top edge.
  const tallCardAt = (visible: number) => ({
    x: 0,
    y: -phone.height / 2 + visible - 150,
    width: 180,
    height: 300,
  });
  const tallCardShowing = (visible: number) =>
    cardScreenRect(tallCardAt(visible), { x: 0, y: 0 }, 1);

  it("is fully opaque once PHONE_ENTRY_BAND_PX of the card is visible", () => {
    expect(PHONE_ENTRY_BAND_PX).toBe(40);
    expect(cardEntryProgress(tallCardShowing(40), phone.width, phone.height)).toBe(1);
  });

  it("ramps linearly across that band and is 0 while the card is entirely outside", () => {
    expect(cardEntryProgress(tallCardShowing(20), phone.width, phone.height)).toBeCloseTo(0.5, 10);
    expect(cardEntryProgress(tallCardShowing(0), phone.width, phone.height)).toBe(0);
  });
});
