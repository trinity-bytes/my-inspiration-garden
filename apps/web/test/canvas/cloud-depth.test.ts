import { describe, expect, it } from "vitest";
import {
  ATMOSPHERE_COLOR_HEX,
  ATMOSPHERE_COLOR_RGB,
  cloudDepthStyle,
  cloudOpacityJitterHalfWidth,
  cloudOpacityRange,
} from "../../src/canvas/cloud-depth";

const SAMPLE_DEPTHS = Array.from({ length: 21 }, (_, i) => i / 20); // 0, 0.05, ..., 1

describe("cloudDepthStyle", () => {
  it("is monotonic across depth: nearer means strictly faster, larger, higher draw order, and less atmosphere", () => {
    let previous = cloudDepthStyle(SAMPLE_DEPTHS[0] as number);
    for (const depth of SAMPLE_DEPTHS.slice(1)) {
      const current = cloudDepthStyle(depth);

      expect(current.parallax).toBeGreaterThan(previous.parallax);
      expect(current.opacity).toBeGreaterThanOrEqual(previous.opacity);
      expect(current.atmosphereMix).toBeLessThan(previous.atmosphereMix);
      expect(current.sizeScale).toBeGreaterThan(previous.sizeScale);
      expect(current.renderOrder).toBeGreaterThan(previous.renderOrder);

      previous = current;
    }
  });

  it("the nearest layer (depth=1) is fully solid: opacity=1, atmosphereMix=0", () => {
    const nearest = cloudDepthStyle(1);
    expect(nearest.opacity).toBe(1);
    expect(nearest.atmosphereMix).toBe(0);
  });

  // T8b-3 owner feedback (second retune, goal = realism): stronger
  // atmospheric perspective than the T8b-2 retune (which had opacity
  // ~0.5-0.6, atmosphereMix ~0.45-0.55) — far now reads noticeably hazier,
  // opacity ~0.45, atmosphereMix ~0.65.
  it("the farthest layer (depth=0) reads strongly hazy (T8b-3 realism retune): opacity ~0.4-0.5, atmosphereMix ~0.6-0.7", () => {
    const farthest = cloudDepthStyle(0);
    expect(farthest.opacity).toBeGreaterThanOrEqual(0.4);
    expect(farthest.opacity).toBeLessThanOrEqual(0.5);
    expect(farthest.atmosphereMix).toBeGreaterThanOrEqual(0.6);
    expect(farthest.atmosphereMix).toBeLessThanOrEqual(0.7);
  });

  // T8b-3 owner feedback: "the motion still doesn't feel right" — clouds
  // should read as barely faster than the sky (SKY_PARALLAX=0.05,
  // engine.ts) rather than distinctly faster. far/near depth-style
  // endpoints retuned so far (depth=0, ~0.08) and mid (depth=0.3, see
  // engine.ts's CLOUD_DEPTH_MID, ~0.13) both sit just above the sky/haze
  // parallax band — see cloud-visibility.test.ts for the sky/far/mid
  // ratio assertions against the live engine.ts constants.
  it("keeps the parallax range at the retuned, barely-faster-than-sky far/near endpoints (~0.08 .. ~0.25)", () => {
    const far = cloudDepthStyle(0);
    const near = cloudDepthStyle(1);
    expect(far.parallax).toBeCloseTo(0.08, 1);
    expect(near.parallax).toBeCloseTo(0.25, 1);
  });

  it("clamps depth to [0, 1] for out-of-range inputs", () => {
    expect(cloudDepthStyle(-5)).toEqual(cloudDepthStyle(0));
    expect(cloudDepthStyle(5)).toEqual(cloudDepthStyle(1));
  });
});

describe("cloudOpacityJitterHalfWidth", () => {
  it("shrinks to exactly zero at depth=1 (no jitter — the near layer is fixed solid)", () => {
    expect(cloudOpacityJitterHalfWidth(1)).toBe(0);
  });

  it("is positive for depth < 1", () => {
    expect(cloudOpacityJitterHalfWidth(0)).toBeGreaterThan(0);
    expect(cloudOpacityJitterHalfWidth(0.5)).toBeGreaterThan(0);
  });
});

describe("cloudOpacityRange", () => {
  it("the near band collapses to exactly [1, 1]", () => {
    expect(cloudOpacityRange(1)).toEqual({ min: 1, max: 1 });
  });

  it("min <= max at every depth", () => {
    for (const depth of SAMPLE_DEPTHS) {
      const range = cloudOpacityRange(depth);
      expect(range.min).toBeLessThanOrEqual(range.max);
    }
  });

  it("invariant — layers never cross: far/mid/near opacity bands stay strictly ordered", () => {
    const far = cloudOpacityRange(0);
    const mid = cloudOpacityRange(0.5);
    const near = cloudOpacityRange(1);

    expect(far.max).toBeLessThan(mid.min);
    expect(mid.max).toBeLessThan(near.min);
  });
});

describe("atmosphere color", () => {
  it("exports a valid hex color and its matching normalized RGB", () => {
    expect(ATMOSPHERE_COLOR_HEX).toMatch(/^#[0-9a-fA-F]{6}$/);
    for (const channel of [
      ATMOSPHERE_COLOR_RGB.r,
      ATMOSPHERE_COLOR_RGB.g,
      ATMOSPHERE_COLOR_RGB.b,
    ]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});
