/**
 * A cloud sprite must never be drawn larger, in DEVICE px, than its source
 * texture's own resolution — beyond that the GPU is magnifying (upscaling)
 * the texture, which reads as blurry (owner feedback, T8a). `dpr` is the
 * device pixel ratio (already capped by the engine at 2).
 */
export function maxSpriteCssSize(texturePx: number, dpr: number): number {
  const safeDpr = dpr > 0 ? dpr : 1;
  return texturePx / safeDpr;
}

/** Clamps a requested CSS-px sprite size so it never exceeds `maxSpriteCssSize`. */
export function clampSpriteCssSize(
  requestedCssSize: number,
  texturePx: number,
  dpr: number,
): number {
  return Math.min(requestedCssSize, maxSpriteCssSize(texturePx, dpr));
}

/**
 * On-screen quad size for a sprite that preserves its texture's aspect ratio
 * (owner feedback, T8a: square quads squashed wide clouds). `requestedCssWidth`
 * is the desired width; the width is clamped by the texture width, which also
 * bounds the height since both axes scale together.
 */
export function spriteQuadCssSize(
  requestedCssWidth: number,
  textureWidthPx: number,
  textureHeightPx: number,
  dpr: number,
): { width: number; height: number } {
  const width = clampSpriteCssSize(requestedCssWidth, textureWidthPx, dpr);
  return { width, height: (width * textureHeightPx) / textureWidthPx };
}
