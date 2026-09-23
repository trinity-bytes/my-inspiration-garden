import { describe, expect, it } from "vitest";
import { extractPalette, hexDistance, hexToRgb, normalizePalette } from "../src/palette";

function solidPixels(hex: string, count: number, alpha = 255): Uint8ClampedArray {
  const rgb = hexToRgb(hex);
  const pixels = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    pixels[i * 4] = rgb.r;
    pixels[i * 4 + 1] = rgb.g;
    pixels[i * 4 + 2] = rgb.b;
    pixels[i * 4 + 3] = alpha;
  }
  return pixels;
}

describe("extractPalette", () => {
  it("returns an empty array for an all-transparent image", () => {
    const pixels = solidPixels("#ff0000", 10, 0);
    expect(extractPalette(pixels)).toEqual([]);
  });

  it("extracts a single dominant color from a solid image with weight 1", () => {
    const pixels = solidPixels("#336699", 100);
    const palette = extractPalette(pixels);
    expect(palette).toHaveLength(1);
    expect(palette[0]?.hex).toBe("#336699");
    expect(palette[0]?.weight).toBeCloseTo(1);
  });

  it("extracts multiple colors sorted by descending weight, ignoring transparent pixels", () => {
    const red = solidPixels("#ff0000", 60);
    const blue = solidPixels("#0000ff", 20);
    const transparent = solidPixels("#00ff00", 30, 0);
    const pixels = new Uint8ClampedArray(red.length + blue.length + transparent.length);
    pixels.set(red, 0);
    pixels.set(blue, red.length);
    pixels.set(transparent, red.length + blue.length);

    const palette = extractPalette(pixels, { colorCount: 5 });
    expect(palette.length).toBeGreaterThanOrEqual(2);
    expect(palette[0]?.hex).toBe("#ff0000");
    expect(palette[0]?.weight).toBeGreaterThan(palette[1]?.weight ?? 0);
    const totalWeight = palette.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
  });

  it("is deterministic across repeated calls on the same input", () => {
    const pixels = solidPixels("#abcdef", 40);
    expect(extractPalette(pixels)).toEqual(extractPalette(pixels));
  });

  it("clamps colorCount between 5 and 8", () => {
    const pixels = solidPixels("#123456", 200);
    // a single solid color always collapses to 1 box regardless of requested count
    expect(extractPalette(pixels, { colorCount: 2 })).toHaveLength(1);
  });
});

describe("normalizePalette", () => {
  it("returns an empty array for an empty list", () => {
    expect(normalizePalette([])).toEqual([]);
  });

  it("splits weight evenly across plain hex strings", () => {
    expect(normalizePalette(["#ff0000", "#00ff00"])).toEqual([
      { hex: "#ff0000", weight: 0.5 },
      { hex: "#00ff00", weight: 0.5 },
    ]);
  });

  it("preserves explicit weights on object entries and defaults missing ones evenly", () => {
    expect(normalizePalette([{ hex: "#ff0000", weight: 0.7 }, { hex: "#00ff00" }])).toEqual([
      { hex: "#ff0000", weight: 0.7 },
      { hex: "#00ff00", weight: 0.5 },
    ]);
  });
});

describe("hexToRgb / hexDistance", () => {
  it("converts hex to rgb components", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("computes 0 distance for identical colors", () => {
    expect(hexDistance("#112233", "#112233")).toBe(0);
  });

  it("computes the euclidean rgb distance", () => {
    expect(hexDistance("#000000", "#000000")).toBe(0);
    expect(hexDistance("#000000", "#ffffff")).toBeCloseTo(Math.sqrt(3 * 255 * 255));
  });
});
