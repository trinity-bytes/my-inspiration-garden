import type { Item } from "@garden/shared";

/**
 * Skeleton loading state (Figma Proposals `68:3061`). Pure timing and layout
 * data; `layers/cards.ts` applies it and `shaders/card.ts` paints it, so the
 * skeleton shares the real cards' grid, pan and barrel lens.
 */

/** Length of every skeleton fade: a card revealing over its skeleton, and the layers swapping when the items land (`--motion-duration-base`). */
export const SKELETON_FADE_SECONDS = 0.25;
/** One pass of the sheen across the canvas. */
export const SHEEN_SWEEP_SECONDS = 1.6;
/** Rest between two passes. */
export const SHEEN_PAUSE_SECONDS = 0.4;
/** The band's tilt, as x shift per y pixel (tan 12°); `shaders/card.ts` receives the same value. */
export const SHEEN_SLOPE = 0.21;
/** A band center no card can reach: draws no sheen. */
export const SHEEN_OFFSCREEN_PX = -1e6;

const SHEEN_HALF_WIDTH_FRACTION = 0.15;

/** Placeholder shapes in layout order: the aspects of `item-layout.ts`'s `KIND_DEFAULT_ASPECT`, in a mix with no kind implied. */
const SKELETON_SHAPES: ReadonlyArray<{ aspect: number; lines: boolean }> = [
  { aspect: 1, lines: false },
  { aspect: 1.3, lines: true },
  { aspect: 16 / 9, lines: false },
  { aspect: 0.8, lines: true },
  { aspect: 1.6, lines: false },
  { aspect: 1.4, lines: false },
  { aspect: 1, lines: false },
];

const ASPECT_BASE_PX = 1000;
const SKELETON_TIMESTAMP = "1970-01-01T00:00:00.000Z";

/**
 * Stand-in items that drive `visibleCardInstances` while the real ones load.
 * Image items, because their aspect comes straight from `data`. They only
 * ever reach the skeleton layer: never hit-testing or the DOM mirror.
 */
export const SKELETON_ITEMS: Item[] = SKELETON_SHAPES.map(({ aspect }, index) => ({
  id: `skeleton-${index}`,
  kind: "image",
  source: "web",
  categoryIds: [],
  tags: [],
  createdAt: SKELETON_TIMESTAMP,
  updatedAt: SKELETON_TIMESTAMP,
  data: {
    r2Key: "skeleton",
    width: Math.round(ASPECT_BASE_PX * aspect),
    height: ASPECT_BASE_PX,
    mime: "image/png",
  },
}));

const SKELETON_ITEM_IDS_WITH_LINES = new Set(
  SKELETON_ITEMS.filter((_, index) => SKELETON_SHAPES[index]?.lines).map((item) => item.id),
);

/** True for the placeholders drawn with text lines (Skeleton Card, `Shape=Text`). */
export function skeletonHasLines(item: Item): boolean {
  return SKELETON_ITEM_IDS_WITH_LINES.has(item.id);
}

/** The band's half width in the given pixel space; measured on the longer side so a portrait phone keeps a wide band. */
export function sheenHalfWidthPx(widthPx: number, heightPx: number): number {
  return Math.max(widthPx, heightPx) * SHEEN_HALF_WIDTH_FRACTION;
}

/**
 * Where the band is at `timeSeconds`, along the axis `x + y * SHEEN_SLOPE`.
 * It enters fully off one edge and leaves fully off the other, so a single
 * band crosses the whole canvas instead of one per card.
 */
export function sheenCenterPx(
  timeSeconds: number,
  widthPx: number,
  heightPx: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) {
    return SHEEN_OFFSCREEN_PX;
  }
  const elapsed = timeSeconds % (SHEEN_SWEEP_SECONDS + SHEEN_PAUSE_SECONDS);
  if (elapsed >= SHEEN_SWEEP_SECONDS) {
    return SHEEN_OFFSCREEN_PX;
  }
  const half = sheenHalfWidthPx(widthPx, heightPx);
  const travel = widthPx + heightPx * SHEEN_SLOPE + half * 2;
  return -half + travel * (elapsed / SHEEN_SWEEP_SECONDS);
}

/** Advances a 0..1 fade toward `target`; instant under reduced motion. */
export function stepFade(
  current: number,
  target: number,
  dtSeconds: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) {
    return target;
  }
  const step = dtSeconds / SKELETON_FADE_SECONDS;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}
