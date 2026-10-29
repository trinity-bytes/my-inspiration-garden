import { describe, expect, it } from "vitest";
import {
  cardEntryProgress,
  cardOpacity,
  cardScreenRect,
  DEFAULT_FADE_INSET_PX,
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

describe("cardEntryProgress default inset per axis (narrow phone axis)", () => {
  // Phone portrait: 189px cards on a 390px-wide screen.
  const phoneWidth = 390;
  const phoneHeight = 844;
  const card = (x: number, y: number) =>
    cardScreenRect({ x, y, width: 189, height: 189 }, { x: 0, y: 0 }, 1);

  it("is fully entered once a card is flush with the edge of a narrow axis", () => {
    expect(cardEntryProgress(card(195 - 94.5, 0), phoneWidth, phoneHeight)).toBe(1);
  });

  it("ramps only across the last PHONE_ENTRY_BAND_PX of a card poking past a narrow axis", () => {
    expect(cardEntryProgress(card(195, 0), phoneWidth, phoneHeight)).toBe(1);
    expect(cardEntryProgress(card(195 + 94.5 - 20, 0), phoneWidth, phoneHeight)).toBeCloseTo(
      0.5,
      5,
    );
    expect(cardEntryProgress(card(195 + 94.5, 0), phoneWidth, phoneHeight)).toBe(0);
  });

  it("caps the taller phone axis to the same band, and keeps the default inset on desktop", () => {
    const inset = DEFAULT_FADE_INSET_PX;
    const flushVertically = card(0, 422 - 94.5);
    expect(cardEntryProgress(flushVertically, phoneWidth, phoneHeight)).toBe(1);
    const desktopFlush = cardScreenRect(
      { x: 450, y: 0, width: 100, height: 100 },
      { x: 0, y: 0 },
      1,
    );
    expect(cardEntryProgress(desktopFlush, 1000, 800)).toBeCloseTo(100 / (100 + inset), 5);
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

  it("is finite (not NaN/Infinity) for a zero-size rect with inset 0, inside the viewport", () => {
    const rect = cardScreenRect({ x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0 }, 1);
    const progress = cardEntryProgress(rect, viewportWidth, viewportHeight, 0);
    expect(Number.isFinite(progress)).toBe(true);
    expect(progress).toBe(1);
  });

  it("is finite (not NaN/Infinity) for a zero-size rect with inset 0, outside the viewport", () => {
    const rect = cardScreenRect({ x: 5000, y: 0, width: 0, height: 0 }, { x: 0, y: 0 }, 1);
    const progress = cardEntryProgress(rect, viewportWidth, viewportHeight, 0);
    expect(Number.isFinite(progress)).toBe(true);
    expect(progress).toBe(0);
  });

  it("is finite for a zero-size rect with a negative inset", () => {
    const inside = cardScreenRect({ x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0 }, 1);
    const outside = cardScreenRect({ x: 5000, y: 0, width: 0, height: 0 }, { x: 0, y: 0 }, 1);
    expect(Number.isFinite(cardEntryProgress(inside, viewportWidth, viewportHeight, -10))).toBe(
      true,
    );
    expect(Number.isFinite(cardEntryProgress(outside, viewportWidth, viewportHeight, -10))).toBe(
      true,
    );
  });

  it("still behaves normally (unaffected) for an ordinary non-degenerate rect", () => {
    const rect = cardScreenRect({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0 }, 1);
    expect(cardEntryProgress(rect, viewportWidth, viewportHeight, 80)).toBe(1);
  });

  it("is finite (not NaN) for a zero-size rect sitting exactly on the viewport edge with inset 0 (0/0 case)", () => {
    // center.x === halfViewport exactly: insideDepth === 0 and extent === 0,
    // so the raw formula divides 0 by 0.
    const rect = cardScreenRect({ x: 500, y: 0, width: 0, height: 0 }, { x: 0, y: 0 }, 1);
    const progress = cardEntryProgress(rect, viewportWidth, viewportHeight, 0);
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

  it("keeps the desktop ramp (card extent + fade inset) unchanged", () => {
    const desktop = { width: 1440, height: 900 };
    const rect = cardScreenRect(
      { x: 0, y: -desktop.height / 2 + 120 - 150, width: 180, height: 300 },
      { x: 0, y: 0 },
      1,
    );
    expect(cardEntryProgress(rect, desktop.width, desktop.height)).toBeCloseTo(120 / 380, 10);
  });
});
