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

  // T8b-2 owner feedback (retune far+mid together after the near layer's
  // removal): "a little" more atmospheric perspective — opacity down and
  // atmosphereMix up vs the pre-retune far values (opacity 0.65,
  // atmosphereMix 0.4) — so the farthest layer blends further into the sky.
  it("the farthest layer (depth=0) reads as hazier than before the T8b-2 retune: opacity ~0.5-0.6, atmosphereMix ~0.45-0.55", () => {
    const farthest = cloudDepthStyle(0);
    expect(farthest.opacity).toBeGreaterThanOrEqual(0.5);
    expect(farthest.opacity).toBeLessThanOrEqual(0.6);
    expect(farthest.atmosphereMix).toBeGreaterThanOrEqual(0.45);
    expect(farthest.atmosphereMix).toBeLessThanOrEqual(0.55);
  });

  // T8b-2 owner feedback: "slower" — both remaining layers (far depth=0,
  // mid depth=0.4, see engine.ts's CLOUD_DEPTH_MID) parallax reduced to
  // ~0.6x their pre-retune values (far was 0.3, mid was 0.5 at the old
  // depth=0.5) — the far/near depth-style endpoints below are what those
  // two layers are actually sampled from.
  it("keeps the parallax range at the retuned, slower far/near endpoints (~0.18 .. ~0.48)", () => {
    const far = cloudDepthStyle(0);
    const near = cloudDepthStyle(1);
    expect(far.parallax).toBeCloseTo(0.18, 1);
    expect(near.parallax).toBeCloseTo(0.48, 1);
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
