import type { Item, ItemKind } from "@garden/shared";
import {
  cellCountInRange,
  clampPoolSize,
  type ViewportWorldRect,
  visibleCellRange,
} from "./cloud-field";
import { clamp } from "./deadzone";
import type { Vec2 } from "./types";

/**
 * Virtualized infinite wrap layout of items: world space is divided into a
 * dense grid of cells (unlike the sparse cloud-field, EVERY cell is
 * occupied). Each cell deterministically picks one item from the input
 * array by hashing its own coordinates — so the same items array always
 * produces the same layout, items repeat to fill the infinite plane, and
 * only cells overlapping the (parallaxed) viewport + margin are ever
 * instantiated by the caller (see `visibleCardInstances`, reusing the same
 * virtualization primitives as `cloud-field.ts`: `visibleCellRange`,
 * `cellCountInRange`, `clampPoolSize`).
 */

export const CARD_CELL_SIZE = 340;
export const CARD_WIDTH_MIN_FRACTION = 0.55;
export const CARD_WIDTH_MAX_FRACTION = 0.86;
export const CARD_ASPECT_MIN = 0.5;
export const CARD_ASPECT_MAX = 2;
export const DEFAULT_MAX_CARD_POOL_SIZE = 240;
/** Extra cells rendered beyond the viewport so cards fade in before popping. */
export const DEFAULT_CARD_MARGIN_CELLS = 1;

export interface CardWorldRect {
  /** Center, world x. */
  x: number;
  /** Center, world y (this engine's y-down convention, see `coords.ts`). */
  y: number;
  width: number;
  height: number;
}

export interface CardInstance {
  /** Stable identity for this cell (`"${cellX},${cellY}"`), NOT the item id — the same item can occupy many cells. */
  key: string;
  cellX: number;
  cellY: number;
  item: Item;
  worldRect: CardWorldRect;
}

const CHANNEL_ITEM = 0;
const CHANNEL_SIZE = 104_729;
const CHANNEL_JITTER_X = 224_737;
const CHANNEL_JITTER_Y = 350_377;

const TWO_POW_32 = 4_294_967_296;

/** Small, deterministic 32-bit integer hash (bit-mixing, no external state) — same technique as `cloud-field.ts`'s hash, kept local since this module hashes cell coordinates only (no per-layer channel). */
function hash32(a: number, b: number, c: number): number {
  let h =
    (Math.imul(a | 0, 374_761_393) ^
      Math.imul(b | 0, 668_265_263) ^
      Math.imul(c | 0, 2_147_483_647)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashToUnit(cellX: number, cellY: number, channel: number): number {
  return hash32(cellX, cellY, channel) / TWO_POW_32;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/** Deterministically picks which item (by index) occupies a given cell. Pure. */
export function itemIndexForCell(cellX: number, cellY: number, itemCount: number): number {
  if (itemCount <= 0) {
    return -1;
  }
  return Math.floor(hashToUnit(cellX, cellY, CHANNEL_ITEM) * itemCount) % itemCount;
}

const KIND_DEFAULT_ASPECT: Record<ItemKind, number> = {
  image: 1,
  link: 1.4,
  text: 0.8,
  video: 16 / 9,
  palette: 1.6,
  font: 1.3,
};

/**
 * The card's aspect ratio (width / height), clamped to [CARD_ASPECT_MIN,
 * CARD_ASPECT_MAX]. Per-kind rich rendering is T9; T8b only needs a stable
 * aspect for layout — real image dimensions when known, a sane per-kind
 * default otherwise.
 */
export function cardAspectForItem(item: Item): number {
  if (item.kind === "image" && item.data.width > 0 && item.data.height > 0) {
    return clamp(item.data.width / item.data.height, CARD_ASPECT_MIN, CARD_ASPECT_MAX);
  }
  return clamp(KIND_DEFAULT_ASPECT[item.kind], CARD_ASPECT_MIN, CARD_ASPECT_MAX);
}

/**
 * A card's on-screen size (mixed sizes, derived deterministically from the
 * item id + its aspect ratio — never from mutable state). `baseSize` is the
 * larger of width/height, sized as a fraction of the cell so it never
 * exceeds `CARD_WIDTH_MAX_FRACTION * cellSize` on either axis regardless of
 * aspect ratio (aspect is clamped to a range whose reciprocal is also in
 * range, so the shorter axis is bounded too).
 */
export function cardSizeForItem(
  item: Item,
  cellSize: number = CARD_CELL_SIZE,
): { width: number; height: number } {
  const aspect = cardAspectForItem(item);
  const fraction = lerp(
    CARD_WIDTH_MIN_FRACTION,
    CARD_WIDTH_MAX_FRACTION,
    idHashUnit(item.id, CHANNEL_SIZE),
  );
  const baseSize = cellSize * fraction;
  if (aspect >= 1) {
    return { width: baseSize, height: baseSize / aspect };
  }
  return { width: baseSize * aspect, height: baseSize };
}

/** A deterministic [0, 1) hash of a string id, used where the source is an item id rather than cell coordinates. */
function idHashUnit(id: string, channel: number): number {
  let h = channel | 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 2_654_435_761) | 0;
  }
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  h ^= h >>> 13;
  return (h >>> 0) / TWO_POW_32;
}

/**
 * The card's world-space rect for a given cell: centered in the cell, with
 * a small deterministic jitter (bounded by the cell's own remaining gutter
 * so the card footprint never crosses into a neighboring cell — no card
 * ever overlaps another).
 */
export function cardWorldRect(
  cellX: number,
  cellY: number,
  item: Item,
  cellSize: number = CARD_CELL_SIZE,
): CardWorldRect {
  const { width, height } = cardSizeForItem(item, cellSize);
  const remainingW = (cellSize - width) / 2;
  const remainingH = (cellSize - height) / 2;
  const jitterX = (hashToUnit(cellX, cellY, CHANNEL_JITTER_X) * 2 - 1) * remainingW;
  const jitterY = (hashToUnit(cellX, cellY, CHANNEL_JITTER_Y) * 2 - 1) * remainingH;

  const cellCenterX = cellX * cellSize + cellSize / 2;
  const cellCenterY = cellY * cellSize + cellSize / 2;

  return {
    x: cellCenterX + jitterX,
    y: cellCenterY + jitterY,
    width,
    height,
  };
}

/**
 * A pool entry's assignment identity (`layers/cards.ts`): a cell's
 * `CardInstance.key` alone is NOT enough to know when a pool entry's
 * texture must reload — the same cell key can resolve to a different item
 * after `setItems` replaces the items array (same cell, different item,
 * since `itemIndexForCell` depends on `itemCount`). Combining the cell key
 * with the item id makes that case produce a different assignment key too.
 */
export function cardAssignmentKey(instance: Pick<CardInstance, "key" | "item">): string {
  return `${instance.key}::${instance.item.id}`;
}

/** The full `CardInstance` for one cell, or `null` if there are no items. Pure — extracted so both `visibleCardInstances` and a caching hot-path caller (`engine.ts`) share one implementation. */
export function cardInstanceForCell(
  cellX: number,
  cellY: number,
  items: readonly Item[],
  cellSize: number = CARD_CELL_SIZE,
): CardInstance | null {
  if (items.length === 0) {
    return null;
  }
  const index = itemIndexForCell(cellX, cellY, items.length);
  const item = items[index];
  if (!item) {
    return null;
  }
  return {
    key: `${cellX},${cellY}`,
    cellX,
    cellY,
    item,
    worldRect: cardWorldRect(cellX, cellY, item, cellSize),
  };
}

/** Minimal get/set surface a hot-path caller can plug in to reuse `CardInstance` objects across frames instead of reallocating them every call (see `engine.ts`'s `cardInstanceCache`, an `LruCache`, which already satisfies this shape). */
export interface CardInstanceCache {
  get(key: string): CardInstance | undefined;
  set(key: string, value: CardInstance): void;
}

/**
 * All card instances whose cell overlaps the viewport (centered at
 * `viewportCenterWorld`, this layer's own world coordinates — cards use
 * parallax 1, so this is `-worldOffset` from the engine, see `engine.ts`)
 * plus `marginCells` of margin, capped at `maxPoolSize` (same virtualization
 * pattern as `layers/clouds.ts`). Deterministic: identical arguments always
 * return an identical (by value) array.
 *
 * `cache` and `out` are optional performance hooks for the engine's
 * per-frame hot path: without them (the default, and what every test in
 * `item-layout.test.ts` exercises), every call allocates a fresh array of
 * fresh `CardInstance` objects — simple and easy to reason about. With
 * both supplied, cell computation is memoized (a cell's `CardInstance` is
 * deterministic and only needs computing once per cache lifetime) and
 * results are written into the caller's reused `out` array, so steady-state
 * panning allocates only for cells newly entering the render margin.
 */
export function visibleCardInstances(
  items: Item[],
  viewportCenterWorld: Vec2,
  viewportWidth: number,
  viewportHeight: number,
  marginCells: number = DEFAULT_CARD_MARGIN_CELLS,
  maxPoolSize: number = DEFAULT_MAX_CARD_POOL_SIZE,
  cache?: CardInstanceCache,
  out: CardInstance[] = [],
): CardInstance[] {
  out.length = 0;
  if (items.length === 0) {
    return out;
  }

  const rect: ViewportWorldRect = {
    centerX: viewportCenterWorld.x,
    centerY: viewportCenterWorld.y,
    width: viewportWidth,
    height: viewportHeight,
  };
  const range = visibleCellRange(rect, CARD_CELL_SIZE, marginCells);
  const wantedCount = clampPoolSize(cellCountInRange(range), maxPoolSize);

  let used = 0;
  for (let cellX = range.minX; cellX <= range.maxX && used < wantedCount; cellX++) {
    for (let cellY = range.minY; cellY <= range.maxY && used < wantedCount; cellY++) {
      const key = `${cellX},${cellY}`;
      let instance = cache?.get(key);
      if (!instance) {
        const computed = cardInstanceForCell(cellX, cellY, items, CARD_CELL_SIZE);
        if (!computed) {
          continue;
        }
        instance = computed;
        cache?.set(key, instance);
      }
      out.push(instance);
      used++;
    }
  }
  return out;
}
