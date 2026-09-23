/**
 * Color filter matching: two hex colors are considered a match when their
 * squared RGB Euclidean distance is within `COLOR_DISTANCE_THRESHOLD_SQUARED`
 * (threshold 60 out of a max possible distance of ~441.7, i.e. ~13.6%).
 * Squared distance is compared directly (no `sqrt`) purely so this stays a
 * plain integer comparison; the effective threshold is still 60.
 * This is a simple, documented default for "close enough" swatch matching —
 * not perceptual (e.g. CIE76/94) color distance, which is out of scope for
 * the MVP.
 */
export const COLOR_DISTANCE_THRESHOLD = 60;
const COLOR_DISTANCE_THRESHOLD_SQUARED = COLOR_DISTANCE_THRESHOLD * COLOR_DISTANCE_THRESHOLD;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function isColorMatch(a: string, b: string): boolean {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const dr = ca.r - cb.r;
  const dg = ca.g - cb.g;
  const db = ca.b - cb.b;
  const distanceSquared = dr * dr + dg * dg + db * db;
  return distanceSquared <= COLOR_DISTANCE_THRESHOLD_SQUARED;
}
