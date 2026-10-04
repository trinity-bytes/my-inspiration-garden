/**
 * A sprite must never be drawn larger, in DEVICE px, than
 * `maxUpscaleFactor` times its source texture's own resolution — beyond
 * that the GPU is magnifying (upscaling) the texture, which reads as
 * blurry (owner feedback, T8a). `dpr` is the device pixel ratio (already
 * capped by the engine at 2).
 *
 * `maxUpscaleFactor` defaults to 1 (no upscale — the original T8a rule,
 * still what cards use, see layers/cards.ts). A caller with soft, blurred
 * sprites may pass a larger factor to tolerate a bounded upscale.
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
