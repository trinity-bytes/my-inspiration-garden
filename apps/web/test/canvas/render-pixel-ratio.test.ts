import { describe, expect, it } from "vitest";
import { MAX_RENDER_PIXELS, renderPixelRatio } from "../../src/canvas/render-pixel-ratio";

describe("renderPixelRatio", () => {
  it("uses the device pixel ratio on a 1x screen", () => {
    expect(renderPixelRatio(1, 1920, 1080)).toBe(1);
  });

  it("keeps full Retina resolution on a laptop-sized viewport", () => {
    expect(renderPixelRatio(2, 1470, 956)).toBe(2);
  });

  it("caps the ratio at 2x even on 3x screens", () => {
    expect(renderPixelRatio(3, 390, 844)).toBe(2);
  });

  it("lowers the ratio on a large Retina viewport so the frame stays within the pixel budget", () => {
    const ratio = renderPixelRatio(2, 2240, 1260);
    expect(ratio).toBeLessThan(2);
    expect(ratio).toBeGreaterThanOrEqual(1);
    expect(2240 * ratio * 1260 * ratio).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
  });

  it("never drops below 1x, even when the viewport alone exceeds the budget", () => {
    expect(renderPixelRatio(2, 5120, 2880)).toBe(1);
  });

  it("falls back to 1x when the device pixel ratio is missing", () => {
    expect(renderPixelRatio(0, 800, 600)).toBe(1);
  });
});
