import { hexToRgb } from "../color-contrast";

/**
 * Solid canvas background (deep violet-navy). Must stay equal to the
 * `--color-canvas` token in `styles/tokens.css`, which paints the same color
 * behind the canvas (CSS fallback, loading screen); background.test.ts
 * enforces it.
 */
export const CANVAS_BACKGROUND_HEX = "#1c1830";

/** The background as 0..1 channels (clear color, shader constants). */
export function canvasBackgroundRgb01(): [number, number, number] {
  const { r, g, b } = hexToRgb(CANVAS_BACKGROUND_HEX);
  return [r / 255, g / 255, b / 255];
}
