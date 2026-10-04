import { describe, expect, it } from "vitest";
import { CANVAS_BACKGROUND_HEX, canvasBackgroundRgb01 } from "../../src/canvas/background";
import { BARREL_FRAGMENT_GLSL } from "../../src/canvas/shaders/barrel";
import { relativeLuminance } from "../../src/color-contrast";
import tokensCss from "../../src/styles/tokens.css?raw";

describe("canvas background", () => {
  it("is a solid dark color", () => {
    expect(CANVAS_BACKGROUND_HEX).toMatch(/^#[0-9a-f]{6}$/);
    expect(relativeLuminance(CANVAS_BACKGROUND_HEX)).toBeLessThan(0.05);
  });

  it("matches the --color-canvas design token (single source of truth)", () => {
    const match = tokensCss.match(/--color-canvas:\s*(#[0-9a-fA-F]{6})/);
    expect(match?.[1]?.toLowerCase()).toBe(CANVAS_BACKGROUND_HEX);
  });

  it("converts to 0..1 channels", () => {
    const [r, g, b] = canvasBackgroundRgb01();
    expect(r).toBeCloseTo(0x1c / 255, 5);
    expect(g).toBeCloseTo(0x18 / 255, 5);
    expect(b).toBeCloseTo(0x30 / 255, 5);
  });

  it("fades the barrel post pass edges toward the same background, not a light tint", () => {
    const [r, g, b] = canvasBackgroundRgb01().map((c) => c.toFixed(3));
    expect(BARREL_FRAGMENT_GLSL).toContain(`vec3(${r}, ${g}, ${b})`);
  });
});
