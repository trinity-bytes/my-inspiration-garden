import type { Item, ItemKind } from "@garden/shared";
import { COLUMN_GUTTER_PX } from "./column-layout";
import { clamp } from "./deadzone";
import type { Vec2 } from "./types";

/**
 * Ordered, responsive masonry layout of items (owner feedback, T8b:
 * replaced the original jittered per-cell hash grid — messy, irregular
 * vertical gaps, and poor hash distribution repeated the same item too
 * often in one frame). World space is divided into equal-width, infinite
 * vertical columns (`column-layout.ts`'s `columnLayoutFor`); each column is
 * an infinite periodic stack of the input items (period = item count), so
 * the same items array always produces the same layout, items repeat to
 * fill the infinite plane, and only the rows overlapping the (parallaxed)
 * viewport + margin are ever instantiated by the caller (see
 * `visibleCardInstances`).
 *
 * Column construction (see `columnPeriod`): each column gets its OWN
 * full-period item permutation (a distinct coprime step + starting phase,
 * both deterministically hashed from the column index), not merely a
 * rotation of one shared sequence. A shared sequence rotated per column
 * would still guarantee adjacent columns differ, but it produces
 * predictable diagonals where the same item recurs at a constant
 * (Δcolumn, Δrow) offset — visually a repeating pattern. Independent
 * per-column permutations avoid that structural artifact.
 *
 * Row lookup (`rowForWorldY`) is a binary search over each column's
 * precomputed cumulative-height table — O(log itemCount) — matching the
 * same virtualization spirit as `cloud-field.ts`'s cell-range approach, but
 * along one infinite axis per column instead of a 2D cell grid.
 */

export const CARD_ASPECT_MIN = 0.5;
export const CARD_ASPECT_MAX = 2;
export const DEFAULT_MAX_CARD_POOL_SIZE = 240;
/** Extra world px rendered beyond the viewport so cards exist before they reach the viewport edge, where `card-fade.ts` ramps them in. Chosen to comfortably exceed one column's worth of content, matching the old per-cell grid's `1 cell` margin convention. */
export const DEFAULT_CARD_MARGIN_PX = 340;

export interface CardWorldRect {
  /** Center, world x. */
  x: number;
  /** Center, world y (this engine's y-down convention, see `coords.ts`). */
  y: number;
  width: number;
  height: number;
}

export interface CardInstance {
  /** Stable identity for this slot (`"${columnIndex},${row}"`), NOT the item id — the same item can occupy many slots. */
  key: string;
  columnIndex: number;
  /** This column's logical row (any integer — negative rows extend upward, see `rowForWorldY`). */
  row: number;
  item: Item;
  worldRect: CardWorldRect;
}

/** Small, deterministic 32-bit integer hash (bit-mixing, no external state) — same technique as `cloud-field.ts`'s hash. */
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

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
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
 * CARD_ASPECT_MAX]. Per-kind rich rendering is T9; this layout only needs a
 * stable aspect — real image dimensions when known, a sane per-kind default
 * otherwise.
 */
export function cardAspectForItem(item: Item): number {
  if (item.kind === "image" && item.data.width > 0 && item.data.height > 0) {
    return clamp(item.data.width / item.data.height, CARD_ASPECT_MIN, CARD_ASPECT_MAX);
  }
  return clamp(KIND_DEFAULT_ASPECT[item.kind], CARD_ASPECT_MIN, CARD_ASPECT_MAX);
}

/** A card's world-px height for a given column width: card width is always exactly `columnWidth` (owner feedback: no jitter, no random size scaling), so height is fully determined by the item's aspect ratio. */
export function cardHeightForItem(item: Item, columnWidth: number): number {
  return columnWidth / cardAspectForItem(item);
}

const STEP_CHANNEL = 180_077;
const PHASE_CHANNEL = 966_859;

/**
 * A full-period step for this column's item permutation: `(phase + k*step)
 * % itemCount` for `k = 0..itemCount-1` must visit every item exactly once
 * (`gcd(step, itemCount) === 1`), so a column never repeats an item within
 * one period, and the wrap from its last row back to its first also
 * differs. Deterministically seeded per column (hash of `columnIndex`)
 * rather than shared, so two columns are independent permutations — see
 * the module doc for why that matters.
 */
function columnStep(columnIndex: number, itemCount: number): number {
  if (itemCount <= 2) {
    return 1;
  }
  let step = 1 + (hash32(columnIndex, 0, STEP_CHANNEL) % (itemCount - 1));
  while (gcd(step, itemCount) !== 1) {
    step += 1;
    if (step >= itemCount) {
      step = 1;
      break;
    }
  }
  return step;
}

/** This column's starting item (period position 0), independently hashed from `columnStep` so two columns rarely start AND step alike. */
function columnPhase(columnIndex: number, itemCount: number): number {
  if (itemCount === 0) {
    return 0;
  }
  return hash32(columnIndex, 0, PHASE_CHANNEL) % itemCount;
}

export interface ItemPeriod {
  itemCount: number;
  /** `order[k]` = index into `items` occupying this column's period position `k` (`k` doubles as the row within one period — see `placementAtRow`). */
  order: number[];
  /** `heights[k]` = world-px card height at period position `k`. */
  heights: number[];
  /** `tops[k]` = cumulative world-px offset (from this period's own start) to the top of position `k`'s card. Strictly increasing. */
  tops: number[];
  /** Total world-px span of one period, including the gutter after the last card, so periods tile seamlessly (no extra/missing gap at the wrap). */
  periodHeight: number;
}

/**
 * The full, precomputed item period for one column: a deterministic
 * permutation of `items` (see `columnStep`/`columnPhase`) plus the
 * cumulative heights `rowForWorldY`'s binary search needs. Pure —
 * `columnIndex` (and `items`/`columnWidth`) fully determine the result, so
 * two calls with the same arguments are `toEqual`.
 */
export function columnPeriod(
  items: readonly Item[],
  columnWidth: number,
  columnIndex: number,
): ItemPeriod {
  const itemCount = items.length;
  if (itemCount === 0) {
    return { itemCount: 0, order: [], heights: [], tops: [], periodHeight: 0 };
  }
  const step = columnStep(columnIndex, itemCount);
  const phase = columnPhase(columnIndex, itemCount);
  const order: number[] = new Array(itemCount);
  const heights: number[] = new Array(itemCount);
  const tops: number[] = new Array(itemCount);
  let cursor = 0;
  for (let k = 0; k < itemCount; k++) {
    const itemIndex = mod(phase + k * step, itemCount);
    const item = items[itemIndex] as Item;
    const height = cardHeightForItem(item, columnWidth);
    order[k] = itemIndex;
    heights[k] = height;
    tops[k] = cursor;
    cursor += height + COLUMN_GUTTER_PX;
  }
  return { itemCount, order, heights, tops, periodHeight: cursor };
}

interface RowPlacement {
  itemIndex: number;
  item: Item;
  /** World-px top edge, continuous across period wraps (may be negative for rows above this column's row 0). */
  top: number;
  height: number;
}

/** The item/top/height at a column's logical `row` (any integer). */
function placementAtRow(
  items: readonly Item[],
  period: ItemPeriod,
  row: number,
): RowPlacement | null {
  if (period.itemCount === 0) {
    return null;
  }
  const periodIndex = floorDiv(row, period.itemCount);
  const k = mod(row, period.itemCount);
  const itemIndex = period.order[k] as number;
  return {
    itemIndex,
    item: items[itemIndex] as Item,
    top: periodIndex * period.periodHeight + (period.tops[k] as number),
    height: period.heights[k] as number,
  };
}

/** Binary search: the largest period position `k` whose `tops[k] <= yInPeriod` (`yInPeriod` already reduced into `[0, periodHeight)`). O(log itemCount). */
function posInPeriodForY(period: ItemPeriod, yInPeriod: number): number {
  let lo = 0;
  let hi = period.itemCount - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((period.tops[mid] as number) <= yInPeriod) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** The row (in this column) whose card's top is at or just before world-y `y`. O(log itemCount). */
function rowForWorldY(period: ItemPeriod, y: number): number {
  if (period.itemCount === 0) {
    return 0;
  }
  const periodIndex = Math.floor(y / period.periodHeight);
  const yInPeriod = y - periodIndex * period.periodHeight;
  const k = posInPeriodForY(period, yInPeriod);
  return periodIndex * period.itemCount + k;
}

/**
 * A pool entry's assignment identity (`layers/cards.ts`): a slot's
 * `CardInstance.key` alone is NOT enough to know when a pool entry's
 * texture must reload — the same key can resolve to a different item after
 * `setItems` replaces the items array (same slot, different item, since
 * `columnPeriod` depends on `items`). Combining the key with the item id
 * makes that case produce a different assignment key too.
 */
export function cardAssignmentKey(instance: Pick<CardInstance, "key" | "item">): string {
  return `${instance.key}::${instance.item.id}`;
}

/** Minimal get/set surface a hot-path caller can plug in to reuse `CardInstance` objects across frames instead of reallocating them every call (see `engine.ts`'s `cardInstanceCache`, an `LruCache`, which already satisfies this shape). */
export interface CardInstanceCache {
  get(key: string): CardInstance | undefined;
  set(key: string, value: CardInstance): void;
}

/**
 * All card instances whose column+row slot overlaps the viewport (centered
 * at `viewportCenterWorld`, this layer's own world coordinates — cards use
 * parallax 1, so this is `-worldOffset` from the engine, see `engine.ts`)
 * plus `marginPx` of margin, capped at `maxPoolSize`. Deterministic:
 * identical arguments always return an identical (by value) array.
 *
 * `columnWidth` comes from `column-layout.ts`'s `columnLayoutFor` — the
 * caller recomputes it from the current viewport CSS width every call, so
 * a resize is picked up automatically with no special-case handling.
 *
 * `cache` and `out` are optional performance hooks for the engine's
 * per-frame hot path: without them (the default, and what every test in
 * `item-layout.test.ts` exercises), every call allocates a fresh array of
 * fresh `CardInstance` objects — simple and easy to reason about. With both
 * supplied, a slot's `CardInstance` is memoized (deterministic, only needs
 * computing once per cache lifetime) and results are written into the
 * caller's reused `out` array, so steady-state panning allocates only for
 * slots newly entering the render margin. Each visible column's
 * `columnPeriod` is still rebuilt every call — O(itemCount) per column,
 * cheap for the realistic item counts this layout targets (tens to low
 * hundreds) — trading a small, well-bounded per-frame cost for not needing
 * a second cache layer and its invalidation rules.
 */
export function visibleCardInstances(
  items: Item[],
  viewportCenterWorld: Vec2,
  viewportWidth: number,
  viewportHeight: number,
  columnWidth: number,
  marginPx: number = DEFAULT_CARD_MARGIN_PX,
  maxPoolSize: number = DEFAULT_MAX_CARD_POOL_SIZE,
  cache?: CardInstanceCache,
  out: CardInstance[] = [],
): CardInstance[] {
  out.length = 0;
  if (items.length === 0 || columnWidth <= 0) {
    return out;
  }

  const columnStride = columnWidth + COLUMN_GUTTER_PX;
  const xMin = viewportCenterWorld.x - viewportWidth / 2 - marginPx;
  const xMax = viewportCenterWorld.x + viewportWidth / 2 + marginPx;
  const yMin = viewportCenterWorld.y - viewportHeight / 2 - marginPx;
  const yMax = viewportCenterWorld.y + viewportHeight / 2 + marginPx;

  const colMin = Math.floor((xMin - columnWidth) / columnStride);
  const colMax = Math.ceil(xMax / columnStride);

  let used = 0;
  for (let columnIndex = colMin; columnIndex <= colMax && used < maxPoolSize; columnIndex++) {
    const columnLeft = columnIndex * columnStride;
    if (columnLeft > xMax || columnLeft + columnWidth < xMin) {
      continue;
    }

    const period = columnPeriod(items, columnWidth, columnIndex);
    if (period.itemCount === 0) {
      continue;
    }

    let row = rowForWorldY(period, yMin);
    const rowGuardLimit = maxPoolSize + period.itemCount;
    for (let guard = 0; guard < rowGuardLimit && used < maxPoolSize; guard++) {
      const placement = placementAtRow(items, period, row);
      if (!placement) {
        break;
      }
      if (placement.top > yMax) {
        break;
      }
      if (placement.top + placement.height >= yMin) {
        const key = `${columnIndex},${row}`;
        let instance = cache?.get(key);
        if (!instance) {
          instance = {
            key,
            columnIndex,
            row,
            item: placement.item,
            worldRect: {
              x: columnIndex * columnStride + columnWidth / 2,
              y: placement.top + placement.height / 2,
              width: columnWidth,
              height: placement.height,
            },
          };
          cache?.set(key, instance);
        }
        out.push(instance);
        used++;
      }
      row++;
    }
  }
  return out;
}
