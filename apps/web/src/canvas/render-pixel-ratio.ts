/** Beyond 2x the extra pixels are not visible. */
export const MAX_RENDER_DPR = 2;

/**
 * Upper bound for the device pixels rendered per frame. The scene is drawn into a full-size render
 * target and then resampled by the barrel pass, so GPU fill cost grows with this count. A 13"
 * Retina laptop (~1470x956 CSS px at 2x, ~5.6M px) stays at full resolution; a 24" Retina iMac
 * (~2240x1260 CSS px at 2x, ~11.3M px) is scaled down to fit (fast
 * pans hitched there, with ~78 ms GPU-bound frames and idle JS in a Safari recording).
 */
export const MAX_RENDER_PIXELS = 6_000_000;

/**
 * The renderer's pixel ratio for a `widthPx` x `heightPx` CSS viewport on a `dpr` screen: the
 * device's ratio capped at `MAX_RENDER_DPR`, lowered further so the frame stays within
 * `MAX_RENDER_PIXELS`, and never below 1x.
 */
export function renderPixelRatio(dpr: number, widthPx: number, heightPx: number): number {
  const capped = Math.min(dpr || 1, MAX_RENDER_DPR);
  const budgetRatio = Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, widthPx * heightPx));
  return Math.max(1, Math.min(capped, budgetRatio));
}
