/** Frame delta cap: a longer gap (tab switch, throttled background tab) is clamped so content does not teleport. */
export const MAX_DT_SECONDS = 1 / 30;

export function clampDt(dt: number): number {
  if (!Number.isFinite(dt) || dt < 0) {
    return 0;
  }
  return Math.min(dt, MAX_DT_SECONDS);
}
