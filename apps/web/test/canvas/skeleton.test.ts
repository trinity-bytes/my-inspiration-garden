import { describe, expect, it } from "vitest";
import { cardAspectForItem } from "../../src/canvas/item-layout";
import {
  SHEEN_OFFSCREEN_PX,
  SHEEN_PAUSE_SECONDS,
  SHEEN_SLOPE,
  SHEEN_SWEEP_SECONDS,
  SKELETON_FADE_SECONDS,
  SKELETON_ITEMS,
  sheenCenterPx,
  sheenHalfWidthPx,
  skeletonHasLines,
  stepFade,
} from "../../src/canvas/skeleton";

describe("SKELETON_ITEMS", () => {
  it("follows the real per-kind default aspects, without implying a kind", () => {
    const aspects = SKELETON_ITEMS.map((item) => cardAspectForItem(item, 200));
    for (const expected of [1, 1.4, 0.8, 16 / 9, 1.6, 1.3]) {
      expect(aspects).toContainEqual(expect.closeTo(expected, 2));
    }
  });

  it("mixes plain blocks and text blocks", () => {
    const withLines = SKELETON_ITEMS.filter(skeletonHasLines);
    expect(withLines.length).toBeGreaterThan(0);
    expect(withLines.length).toBeLessThan(SKELETON_ITEMS.length);
  });

  it("gives every placeholder a unique id", () => {
    expect(new Set(SKELETON_ITEMS.map((item) => item.id)).size).toBe(SKELETON_ITEMS.length);
  });
});

describe("sheenCenterPx", () => {
  const width = 1000;
  const height = 500;
  const half = sheenHalfWidthPx(width, height);

  it("enters fully off the left edge when a pass starts", () => {
    expect(sheenCenterPx(0, width, height, false)).toBeCloseTo(-half);
  });

  it("leaves fully off the far edge when the pass ends", () => {
    const end = sheenCenterPx(SHEEN_SWEEP_SECONDS - 0.0001, width, height, false);
    expect(end).toBeCloseTo(width + height * SHEEN_SLOPE + half, 0);
  });

  it("stays off screen during the pause, then starts the next pass", () => {
    expect(sheenCenterPx(SHEEN_SWEEP_SECONDS + 0.1, width, height, false)).toBe(SHEEN_OFFSCREEN_PX);
    const nextPass = SHEEN_SWEEP_SECONDS + SHEEN_PAUSE_SECONDS;
    expect(sheenCenterPx(nextPass, width, height, false)).toBeCloseTo(-half);
  });

  it("never shows under reduced motion", () => {
    expect(sheenCenterPx(0.5, width, height, true)).toBe(SHEEN_OFFSCREEN_PX);
  });
});

describe("sheenHalfWidthPx", () => {
  it("is measured on the longer side, so a portrait phone keeps a wide band", () => {
    expect(sheenHalfWidthPx(390, 844)).toBe(sheenHalfWidthPx(844, 390));
  });
});

describe("stepFade", () => {
  it("moves toward the target at a pace that takes the fade duration", () => {
    expect(stepFade(0, 1, SKELETON_FADE_SECONDS / 2, false)).toBeCloseTo(0.5);
    expect(stepFade(1, 0, SKELETON_FADE_SECONDS / 2, false)).toBeCloseTo(0.5);
  });

  it("stops at the target instead of overshooting", () => {
    expect(stepFade(0.9, 1, 10, false)).toBe(1);
    expect(stepFade(0.1, 0, 10, false)).toBe(0);
  });

  it("jumps straight to the target under reduced motion", () => {
    expect(stepFade(0, 1, 0, true)).toBe(1);
    expect(stepFade(1, 0, 0, true)).toBe(0);
  });
});
