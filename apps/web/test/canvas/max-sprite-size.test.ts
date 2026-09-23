import { describe, expect, it } from "vitest";
import {
  clampSpriteCssSize,
  maxSpriteCssSize,
  spriteQuadCssSize,
} from "../../src/canvas/max-sprite-size";

describe("maxSpriteCssSize", () => {
  it("is texturePx / dpr at dpr=1 (device px == css px)", () => {
    expect(maxSpriteCssSize(1200, 1)).toBeCloseTo(1200, 8);
  });

  it("halves at dpr=2 (each css px is 2 device px, so fewer css px fit the same texture)", () => {
    expect(maxSpriteCssSize(1200, 2)).toBeCloseTo(600, 8);
  });

  it("never exceeds the texture's own resolution at dpr=1", () => {
    for (const texturePx of [400, 800, 1600]) {
      expect(maxSpriteCssSize(texturePx, 1)).toBeLessThanOrEqual(texturePx);
    }
  });

  it("guards against a zero or negative dpr", () => {
    expect(maxSpriteCssSize(1200, 0)).toBeGreaterThan(0);
    expect(Number.isFinite(maxSpriteCssSize(1200, 0))).toBe(true);
    expect(maxSpriteCssSize(1200, -1)).toBeGreaterThan(0);
  });
});

describe("clampSpriteCssSize", () => {
  it("passes a requested size through unchanged when it fits within the texture's device-px budget", () => {
    expect(clampSpriteCssSize(300, 1200, 2)).toBeCloseTo(300, 8);
  });

  it("clamps a requested size down to maxSpriteCssSize when it would exceed the texture's device-px budget", () => {
    // At dpr=2, a 1200px texture supports at most 600 css px on screen.
    expect(clampSpriteCssSize(900, 1200, 2)).toBeCloseTo(600, 8);
  });

  it("on-screen device px never exceeds the texture's own pixel resolution", () => {
    for (const requested of [100, 500, 1000, 2000, 5000]) {
      for (const dpr of [1, 1.5, 2]) {
        const texturePx = 1200;
        const clamped = clampSpriteCssSize(requested, texturePx, dpr);
        expect(clamped * dpr).toBeLessThanOrEqual(texturePx + 1e-6);
      }
    }
  });
});

describe("spriteQuadCssSize", () => {
  it("keeps the texture's aspect ratio (a wide cloud stays wide, never squashed into a square)", () => {
    const { width, height } = spriteQuadCssSize(520, 1600, 879, 1);
    expect(width).toBeCloseTo(520, 8);
    expect(width / height).toBeCloseTo(1600 / 879, 8);
  });

  it("treats the requested size as the quad's width", () => {
    const { width, height } = spriteQuadCssSize(400, 1464, 1216, 1);
    expect(width).toBeCloseTo(400, 8);
    expect(height).toBeCloseTo((400 * 1216) / 1464, 8);
  });

  it("clamps by the texture width so device px never exceed the texture on either axis", () => {
    for (const dpr of [1, 1.5, 2]) {
      const { width, height } = spriteQuadCssSize(5000, 1600, 879, dpr);
      expect(width * dpr).toBeLessThanOrEqual(1600 + 1e-6);
      expect(height * dpr).toBeLessThanOrEqual(879 + 1e-6);
      expect(width / height).toBeCloseTo(1600 / 879, 8);
    }
  });
});
