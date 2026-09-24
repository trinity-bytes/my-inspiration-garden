import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  contrastTextColor,
  hexToRgb,
  relativeLuminance,
} from "../src/color-contrast";

describe("hexToRgb", () => {
  it("parses a 6-digit hex color", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("#2A2140")).toEqual({ r: 42, g: 33, b: 64 });
  });

  it("parses without the leading #", () => {
    expect(hexToRgb("00ff00")).toEqual({ r: 0, g: 255, b: 0 });
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("is higher for a lighter color than a darker one", () => {
    expect(relativeLuminance("#eeeeee")).toBeGreaterThan(relativeLuminance("#333333"));
  });
});

describe("contrastRatio", () => {
  it("is 21 for black vs white (the maximum WCAG ratio)", () => {
    expect(contrastRatio(relativeLuminance("#000000"), relativeLuminance("#ffffff"))).toBeCloseTo(
      21,
      1,
    );
  });

  it("is 1 for identical luminance", () => {
    expect(contrastRatio(0.5, 0.5)).toBeCloseTo(1, 5);
  });

  it("is symmetric (argument order does not matter)", () => {
    const a = relativeLuminance("#e0784e");
    const b = relativeLuminance("#2a2140");
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});

describe("contrastTextColor", () => {
  it("picks white text on a very dark swatch", () => {
    expect(contrastTextColor("#0a0a0a")).toBe("#ffffff");
  });

  it("picks ink text on a very light swatch", () => {
    expect(contrastTextColor("#f6f3fa")).toBe("#2a2140");
  });

  it("always returns a color with a higher (or equal) contrast ratio against the swatch than the other option", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#f29a6b", "#5e4c82", "#808080"]) {
      const bg = relativeLuminance(hex);
      const chosen = contrastTextColor(hex);
      const chosenRatio = contrastRatio(bg, relativeLuminance(chosen));
      const otherRatio = contrastRatio(
        bg,
        relativeLuminance(chosen === "#ffffff" ? "#2a2140" : "#ffffff"),
      );
      expect(chosenRatio).toBeGreaterThanOrEqual(otherRatio);
    }
  });

  it("is deterministic for the same input", () => {
    expect(contrastTextColor("#5e4c82")).toBe(contrastTextColor("#5e4c82"));
  });
});
