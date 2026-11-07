/**
 * WCAG-style contrast helpers. Used by the palette detail view to pick
 * readable text (ink vs white) for a hex value drawn directly on top of its
 * own swatch — the swatch's own color is arbitrary (owner-uploaded), so a
 * single fixed text color can't stay readable across every possible hue.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses a `#rrggbb` or `rrggbb` hex color. Assumes a valid 6-digit hex (palette item data is already schema-validated — `hexColorSchema` in packages/shared). */
export function hexToRgb(hex: string): Rgb {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function linearChannel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, in [0, 1] (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

/** WCAG contrast ratio between two relative luminances, in [1, 21]. Symmetric — argument order does not matter. */
export function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

const INK_HEX = "#2a2140"; // --garden-ink (styles/tokens.css)
const WHITE_HEX = "#ffffff";

/** The one of `--garden-ink` / white with the higher WCAG contrast ratio against `swatchHex`, for a text label drawn directly on top of an arbitrary swatch color. */
export function contrastTextColor(swatchHex: string): string {
  const swatchLuminance = relativeLuminance(swatchHex);
  const inkContrast = contrastRatio(swatchLuminance, relativeLuminance(INK_HEX));
  const whiteContrast = contrastRatio(swatchLuminance, relativeLuminance(WHITE_HEX));
  return inkContrast >= whiteContrast ? INK_HEX : WHITE_HEX;
}
