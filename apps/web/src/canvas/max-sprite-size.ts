/**
 * A sprite must never be drawn larger, in DEVICE px, than
 * `maxUpscaleFactor` times its source texture's own resolution — beyond
 * that the GPU is magnifying (upscaling) the texture, which reads as
 * blurry (owner feedback, T8a). `dpr` is the device pixel ratio (already
 * capped by the engine at 2).
 *
 * `maxUpscaleFactor` defaults to 1 (no upscale — the original T8a rule,
 * still what cards use, see layers/cards.ts). T8b-3 owner feedback: soft,
 * blurred atmospheric cloud sprites tolerate a bounded upscale better than
 * crisp cards do, so layers/clouds.ts passes 1.5 to keep growing cloud size
 * even when the clamp would otherwise cap it at high DPR.
 */
export function maxSpriteCssSize(
  texturePx: number,
  dpr: number,
  maxUpscaleFactor: number = 1,
): number {
  const safeDpr = dpr > 0 ? dpr : 1;
  return (texturePx * maxUpscaleFactor) / safeDpr;
}

/** Clamps a requested CSS-px sprite size so it never exceeds `maxSpriteCssSize`. */
export function clampSpriteCssSize(
  requestedCssSize: number,
  texturePx: number,
  dpr: number,
  maxUpscaleFactor: number = 1,
): number {
  return Math.min(requestedCssSize, maxSpriteCssSize(texturePx, dpr, maxUpscaleFactor));
}

/**
 * On-screen quad size for a sprite that preserves its texture's aspect ratio
 * (owner feedback, T8a: square quads squashed wide clouds). `requestedCssWidth`
 * is the desired width; the width is clamped by the texture width (times
 * `maxUpscaleFactor`, see `maxSpriteCssSize`), which also bounds the height
 * since both axes scale together.
 */
export function spriteQuadCssSize(
  requestedCssWidth: number,
  textureWidthPx: number,
  textureHeightPx: number,
  dpr: number,
  maxUpscaleFactor: number = 1,
): { width: number; height: number } {
  const width = clampSpriteCssSize(requestedCssWidth, textureWidthPx, dpr, maxUpscaleFactor);
  return { width, height: (width * textureHeightPx) / textureWidthPx };
}
