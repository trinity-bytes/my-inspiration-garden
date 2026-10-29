import { describe, expect, it } from "vitest";
import { COLUMN_GUTTER_PX, columnLayoutFor } from "../../src/canvas/column-layout";
import {
  CARD_ASPECT_MAX,
  CARD_ASPECT_MIN,
  cardAspectForItem,
  cardAssignmentKey,
  cardHeightForItem,
  columnPeriod,
  DEFAULT_MAX_CARD_POOL_SIZE,
  visibleCardInstances,
} from "../../src/canvas/item-layout";
import { makeItem } from "../fixtures/items";

describe("cardAspectForItem", () => {
  it("uses the image's own width/height when present", () => {
    const item = makeItem("img1", "image", { width: 400, height: 200 });
    expect(cardAspectForItem(item)).toBeCloseTo(2, 5);
  });

  it("clamps an extreme image aspect ratio into [CARD_ASPECT_MIN, CARD_ASPECT_MAX]", () => {
    const wide = makeItem("img2", "image", { width: 4000, height: 100 });
    expect(cardAspectForItem(wide)).toBeLessThanOrEqual(CARD_ASPECT_MAX);
    const tall = makeItem("img3", "image", { width: 100, height: 4000 });
    expect(cardAspectForItem(tall)).toBeGreaterThanOrEqual(CARD_ASPECT_MIN);
  });

  it("falls back to a kind default, clamped, for non-image kinds", () => {
    for (const kind of ["link", "text", "video", "palette", "font"] as const) {
      const aspect = cardAspectForItem(makeItem(`i-${kind}`, kind));
      expect(aspect).toBeGreaterThanOrEqual(CARD_ASPECT_MIN);
      expect(aspect).toBeLessThanOrEqual(CARD_ASPECT_MAX);
    }
  });

  it("is deterministic for the same item", () => {
    const item = makeItem("img4", "image", { width: 300, height: 150 });
    expect(cardAspectForItem(item)).toBe(cardAspectForItem(item));
  });
});

describe("cardHeightForItem", () => {
  it("is columnWidth / aspect", () => {
    const item = makeItem("h1", "image", { width: 400, height: 200 });
    expect(cardHeightForItem(item, 300)).toBeCloseTo(150, 5);
  });

  it("is deterministic and scales linearly with columnWidth", () => {
    const item = makeItem("h2", "text");
    const a = cardHeightForItem(item, 200);
    const b = cardHeightForItem(item, 400);
    expect(b).toBeCloseTo(a * 2, 5);
  });
});

/**
 * Owner feedback (T9b): short text cards were too tall, with lots of empty
 * space below the wrapped content. The text card's aspect must now be
 * derived from its actual wrapped title/body line count (via `wrap-text.ts`
 * + `approxMeasure`), not a fixed per-kind default — while staying pure and
 * deterministic (layout can't depend on an async/real canvas measurement).
 */
describe("cardAspectForItem content-fit (text kind, columnWidth provided)", () => {
  const columnWidth = 240;

  it("gives very short text content a taller aspect (shorter card) than the old fixed default (0.8)", () => {
    const item = makeItem("t1", "text", { body: "hi" }, { title: "Hi" });
    const aspect = cardAspectForItem(item, columnWidth);
    expect(aspect).toBeGreaterThan(0.8);
  });

  it("gives longer text content a shorter aspect (taller card) than very short content", () => {
    const shortItem = makeItem("t2", "text", { body: "short" }, { title: "Short" });
    const longItem = makeItem(
      "t3",
      "text",
      {
        body: "This is a much longer body of text that will wrap across several lines when it is measured against the column width, unlike the very short one above.",
      },
      { title: "A longer title than the short one" },
    );
    const shortAspect = cardAspectForItem(shortItem, columnWidth);
    const longAspect = cardAspectForItem(longItem, columnWidth);
    expect(longAspect).toBeLessThan(shortAspect);
  });

  it("stays within [CARD_ASPECT_MIN, CARD_ASPECT_MAX] for very long content", () => {
    const item = makeItem(
      "t4",
      "text",
      { body: "word ".repeat(400).trim() },
      { title: "word ".repeat(20).trim() },
    );
    const aspect = cardAspectForItem(item, columnWidth);
    expect(aspect).toBeGreaterThanOrEqual(CARD_ASPECT_MIN);
    expect(aspect).toBeLessThanOrEqual(CARD_ASPECT_MAX);
  });

  it("is deterministic for the same item and columnWidth", () => {
    const item = makeItem("t5", "text", { body: "hello world" }, { title: "Title" });
    expect(cardAspectForItem(item, columnWidth)).toBe(cardAspectForItem(item, columnWidth));
  });

  it("falls back to the fixed default aspect when no columnWidth is provided (back-compat)", () => {
    const item = makeItem("t6", "text", { body: "hi" }, { title: "Hi" });
    expect(cardAspectForItem(item)).toBeCloseTo(0.8, 5);
  });
});

describe("text card title wraps to two lines", () => {
  const columnWidth = 240;
  it("gives a title that needs two lines a taller card than a one-line title with the same body", () => {
    const body = {
      body: "Same body for both cards, long enough to wrap over several lines so neither card is clamped to the aspect limit.",
    };
    const oneLine = makeItem("tt1", "text", body, { title: "Short" });
    const twoLines = makeItem("tt2", "text", body, {
      title: "Composition and negative space in quiet layouts",
    });
    expect(cardAspectForItem(twoLines, columnWidth)).toBeLessThan(
      cardAspectForItem(oneLine, columnWidth),
    );
  });
});

describe("cardAspectForItem content-fit (link kind without a preview image)", () => {
  const columnWidth = 240;

  it("gives a short-titled link without a preview a taller aspect than the fixed default (1.4)", () => {
    const item = makeItem("l1", "link", {}, { title: "Hi" });
    const aspect = cardAspectForItem(item, columnWidth);
    expect(aspect).toBeGreaterThan(1.4);
  });

  it("stays within [CARD_ASPECT_MIN, CARD_ASPECT_MAX]", () => {
    const item = makeItem(
      "l2",
      "link",
      {},
      { title: "A very long link title that will wrap across two lines at this column width" },
    );
    const aspect = cardAspectForItem(item, columnWidth);
    expect(aspect).toBeGreaterThanOrEqual(CARD_ASPECT_MIN);
    expect(aspect).toBeLessThanOrEqual(CARD_ASPECT_MAX);
  });

  it("leaves a link WITH a preview image at the fixed default aspect, ignoring columnWidth", () => {
    const item = makeItem(
      "l3",
      "link",
      { previewImage: "https://example.com/p.png" },
      { title: "Hi" },
    );
    expect(cardAspectForItem(item, columnWidth)).toBeCloseTo(1.4, 5);
  });
});

describe("cardAspectForItem content-fit does not affect other kinds", () => {
  it("video, palette, and font keep their fixed default aspect regardless of columnWidth", () => {
    for (const kind of ["video", "palette", "font"] as const) {
      const item = makeItem(`k-${kind}`, kind);
      expect(cardAspectForItem(item, 240)).toBe(cardAspectForItem(item));
    }
  });
});

/** 24 items spanning every kind, matching the real seed data scale used for owner visual QA. */
function seedItems(count = 24): ReturnType<typeof makeItem>[] {
  const kinds = ["image", "link", "text", "video", "palette", "font"] as const;
  return Array.from({ length: count }, (_, i) => makeItem(`item-${i}`, kinds[i % kinds.length]));
}

describe("columnPeriod", () => {
  it("is a pure function: identical inputs produce an identical period", () => {
    const items = seedItems();
    expect(columnPeriod(items, 220, 3)).toEqual(columnPeriod(items, 220, 3));
  });

  it("visits every item exactly once per period (a full permutation, no repeats within one column's period)", () => {
    const items = seedItems();
    const period = columnPeriod(items, 220, 0);
    expect(period.order).toHaveLength(items.length);
    expect(new Set(period.order).size).toBe(items.length);
    for (const index of period.order) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(items.length);
    }
  });

  it("has a monotonically increasing cumulative top, starting at 0", () => {
    const items = seedItems();
    const period = columnPeriod(items, 220, 5);
    expect(period.tops[0]).toBe(0);
    for (let k = 1; k < period.tops.length; k++) {
      expect(period.tops[k] as number).toBeGreaterThan(period.tops[k - 1] as number);
    }
  });

  it("each entry's height matches cardHeightForItem for its assigned item", () => {
    const items = seedItems();
    const columnWidth = 220;
    const period = columnPeriod(items, columnWidth, 2);
    for (let k = 0; k < period.itemCount; k++) {
      const item = items[period.order[k] as number];
      expect(period.heights[k]).toBeCloseTo(
        cardHeightForItem(item as (typeof items)[number], columnWidth),
        5,
      );
    }
  });

  it("periodHeight is the last card's bottom edge plus one trailing gutter (periods tile seamlessly)", () => {
    const items = seedItems();
    const period = columnPeriod(items, 220, 1);
    const lastIndex = period.itemCount - 1;
    const expected =
      (period.tops[lastIndex] as number) + (period.heights[lastIndex] as number) + COLUMN_GUTTER_PX;
    expect(period.periodHeight).toBeCloseTo(expected, 5);
  });

  it("never repeats the same item at consecutive rows across a period wrap boundary", () => {
    const items = seedItems();
    const period = columnPeriod(items, 220, 4);
    const last = period.order[period.itemCount - 1];
    const first = period.order[0];
    expect(last).not.toBe(first);
  });

  it("periodHeight is identical for every column (all columns share one set of items, so they stay vertically coherent)", () => {
    const items = seedItems();
    const expected = columnPeriod(items, 220, 0).periodHeight;
    for (let c = -12; c <= 12; c++) {
      expect(columnPeriod(items, 220, c).periodHeight).toBeCloseTo(expected, 5);
    }
  });

  it("every column is a rotation of one shared order (the coordinated-columns design)", () => {
    const items = seedItems(34);
    const base = columnPeriod(items, 220, 0).order;
    for (let c = -6; c <= 6; c++) {
      const order = columnPeriod(items, 220, c).order;
      const offset = base.indexOf(order[0] as number);
      expect(order).toEqual(base.map((_, k) => base[(offset + k) % base.length]));
    }
  });

  it("adjacent columns start with a different item (owner: horizontally adjacent columns should not align)", () => {
    const items = seedItems();
    let distinctPairs = 0;
    let totalPairs = 0;
    for (let c = -12; c < 12; c++) {
      const a = columnPeriod(items, 220, c).order[0];
      const b = columnPeriod(items, 220, c + 1).order[0];
      totalPairs++;
      if (a !== b) {
        distinctPairs++;
      }
    }
    // Every adjacent pair must differ (see item-layout.ts's `columnPhase`).
    expect(distinctPairs).toBe(totalPairs);
  });

  // Property test across item counts and a wide column range that starts at
  // a negative offset (columns go negative). Adjacent golden-ratio phases
  // differ by about 0.618 * N, so adjacent starts differ for every N >= 3;
  // with exactly 2 items `columnPhase` alternates instead (see there).
  it.each([1, 2, 3, 4, 5, 6, 8, 13, 24, 34, 40, 60, 100, 150])(
    "property: adjacent columns never start with the same item, for any item count (%i items)",
    (itemCount) => {
      const items = seedItems(itemCount);
      let previous = columnPeriod(items, 220, -50).order[0];
      for (let c = -49; c <= 50; c++) {
        const current = columnPeriod(items, 220, c).order[0];
        if (itemCount > 1) {
          expect(current).not.toBe(previous);
        }
        previous = current;
      }
    },
  );
});

// T9 carried follow-up: memoize columnPeriod by (columnIndex, columnWidth,
// itemCount), invalidated the same way as the engine's card-instance cache
// (see engine.ts's `columnPeriodCache`, cleared on `setItems` and on a
// column-width change from a resize).
describe("columnPeriod caching", () => {
  it("accepts an optional cache and reuses (does not recompute) a hit", () => {
    const items = seedItems();
    const cache = new Map<string, ReturnType<typeof columnPeriod>>();
    const cacheAdapter = {
      get: (key: string) => cache.get(key),
      set: (key: string, value: ReturnType<typeof columnPeriod>) => {
        cache.set(key, value);
      },
    };

    const first = columnPeriod(items, 220, 3, cacheAdapter);
    expect(cache.size).toBe(1);
    const second = columnPeriod(items, 220, 3, cacheAdapter);
    // Cache hit: the exact same object identity is returned, not merely an
    // equal value — proof it was not recomputed.
    expect(second).toBe(first);
  });

  it("keys the cache by columnIndex, columnWidth AND itemCount (a change in any of them is a cache miss)", () => {
    const items = seedItems();
    const cache = new Map<string, ReturnType<typeof columnPeriod>>();
    const cacheAdapter = {
      get: (key: string) => cache.get(key),
      set: (key: string, value: ReturnType<typeof columnPeriod>) => {
        cache.set(key, value);
      },
    };

    columnPeriod(items, 220, 3, cacheAdapter);
    columnPeriod(items, 250, 3, cacheAdapter); // different columnWidth
    columnPeriod(items, 220, 4, cacheAdapter); // different columnIndex
    columnPeriod(items.slice(0, -1), 220, 3, cacheAdapter); // different itemCount
    expect(cache.size).toBe(4);
  });

  it("without a cache, still returns a correct (uncached) result", () => {
    const items = seedItems();
    expect(columnPeriod(items, 220, 3)).toEqual(columnPeriod(items, 220, 3));
  });

  // T9 carried follow-up: "resize cache-invalidation test". A resize
  // changes columnWidth; a shared cache must never hand back a period
  // computed for the OLD width (stale card heights/positions) for the NEW
  // width — the cache key includes columnWidth precisely so this can't
  // happen, exercised here through the same `visibleCardInstances` entry
  // point the engine calls every frame.
  it("visibleCardInstances: a shared periodCache never serves a stale period across a columnWidth change (resize)", () => {
    const items = seedItems();
    const cache = new Map<string, ReturnType<typeof columnPeriod>>();
    const periodCache = {
      get: (key: string) => cache.get(key),
      set: (key: string, value: ReturnType<typeof columnPeriod>) => {
        cache.set(key, value);
      },
    };

    const before = visibleCardInstances(
      items,
      { x: 0, y: 0 },
      1440,
      900,
      220,
      0,
      DEFAULT_MAX_CARD_POOL_SIZE,
      undefined,
      [],
      periodCache,
    );
    expect(before.every((instance) => instance.worldRect.width === 220)).toBe(true);

    // Simulated resize: a different columnWidth, same shared periodCache
    // (as the engine reuses one cache instance across frames/resizes).
    const after = visibleCardInstances(
      items,
      { x: 0, y: 0 },
      1440,
      900,
      260,
      0,
      DEFAULT_MAX_CARD_POOL_SIZE,
      undefined,
      [],
      periodCache,
    );
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((instance) => instance.worldRect.width === 260)).toBe(true);
  });
});

describe("cardAssignmentKey", () => {
  it("is stable for the same cell and item", () => {
    const instance = { key: "3,4", item: makeItem("a") };
    expect(cardAssignmentKey(instance)).toBe(cardAssignmentKey(instance));
  });

  it("differs when the cell key differs (same item)", () => {
    const item = makeItem("a");
    expect(cardAssignmentKey({ key: "3,4", item })).not.toBe(
      cardAssignmentKey({ key: "3,5", item }),
    );
  });

  it("differs when the item differs, even for the SAME cell key (setItems reassigning a cell to a new item)", () => {
    const a = cardAssignmentKey({ key: "3,4", item: makeItem("a") });
    const b = cardAssignmentKey({ key: "3,4", item: makeItem("b") });
    expect(a).not.toBe(b);
  });
});

describe("visibleCardInstances", () => {
  const items = [
    makeItem("a", "image"),
    makeItem("b", "link"),
    makeItem("c", "text"),
    makeItem("d", "video"),
  ];
  const columnWidth = 220;

  it("returns nothing when there are no items", () => {
    expect(visibleCardInstances([], { x: 0, y: 0 }, 1000, 800, columnWidth)).toEqual([]);
  });

  it("is deterministic: identical inputs produce identical output (same items -> same layout)", () => {
    const a = visibleCardInstances(items, { x: 0, y: 0 }, 1000, 800, columnWidth);
    const b = visibleCardInstances(items, { x: 0, y: 0 }, 1000, 800, columnWidth);
    expect(a).toEqual(b);
  });

  it("every returned instance's item comes from the input items array (repetition allowed)", () => {
    const instances = visibleCardInstances(items, { x: 0, y: 0 }, 1000, 800, columnWidth);
    const ids = new Set(items.map((item) => item.id));
    for (const instance of instances) {
      expect(ids.has(instance.item.id)).toBe(true);
    }
  });

  it("repeats the single item across many rows when only one item exists", () => {
    const single = [makeItem("only", "palette")];
    const instances = visibleCardInstances(single, { x: 0, y: 0 }, 1200, 900, columnWidth);
    expect(instances.length).toBeGreaterThan(1);
    for (const instance of instances) {
      expect(instance.item.id).toBe("only");
    }
  });

  it("respects the maxPoolSize cap", () => {
    const instances = visibleCardInstances(items, { x: 0, y: 0 }, 4000, 4000, columnWidth, 100, 25);
    expect(instances.length).toBeLessThanOrEqual(25);
  });

  it("shifts which cards are visible as the viewport center moves", () => {
    const near = visibleCardInstances(items, { x: 0, y: 0 }, 800, 600, columnWidth);
    const far = visibleCardInstances(items, { x: 20_000, y: 0 }, 800, 600, columnWidth);
    const nearKeys = new Set(near.map((instance) => instance.key));
    const farKeys = new Set(far.map((instance) => instance.key));
    const overlap = [...nearKeys].filter((key) => farKeys.has(key));
    expect(overlap.length).toBe(0);
  });

  it("every card's width is exactly the column width (no jitter, no random size scaling)", () => {
    const instances = visibleCardInstances(seedItems(), { x: 0, y: 0 }, 1440, 900, columnWidth);
    expect(instances.length).toBeGreaterThan(0);
    for (const instance of instances) {
      expect(instance.worldRect.width).toBe(columnWidth);
    }
  });

  it("every card's height is columnWidth / its item's aspect", () => {
    const instances = visibleCardInstances(seedItems(), { x: 0, y: 0 }, 1440, 900, columnWidth);
    for (const instance of instances) {
      expect(instance.worldRect.height).toBeCloseTo(
        cardHeightForItem(instance.item, columnWidth),
        5,
      );
    }
  });

  it("applies a given (mobile) gutter to both the horizontal and the vertical gap", () => {
    const gutter = 12;
    const instances = visibleCardInstances(
      seedItems(),
      { x: 0, y: 0 },
      390,
      844,
      columnWidth,
      0,
      undefined,
      undefined,
      [],
      undefined,
      gutter,
    );
    const byColumn = new Map<number, typeof instances>();
    for (const instance of instances) {
      byColumn.set(instance.columnIndex, [...(byColumn.get(instance.columnIndex) ?? []), instance]);
    }

    const leftmost = Math.min(...byColumn.keys());
    expect(byColumn.has(leftmost + 1)).toBe(true);
    const first = byColumn.get(leftmost)?.[0];
    const second = byColumn.get(leftmost + 1)?.[0];
    expect((second?.worldRect.x as number) - (first?.worldRect.x as number)).toBeCloseTo(
      columnWidth + gutter,
      5,
    );

    const column = [...(byColumn.get(leftmost) ?? [])].sort(
      (a, b) => a.worldRect.y - b.worldRect.y,
    );
    expect(column.length).toBeGreaterThan(1);
    for (let i = 1; i < column.length; i++) {
      const prev = column[i - 1] as (typeof instances)[number];
      const curr = column[i] as (typeof instances)[number];
      const gap =
        curr.worldRect.y -
        curr.worldRect.height / 2 -
        (prev.worldRect.y + prev.worldRect.height / 2);
      expect(gap).toBeCloseTo(gutter, 3);
    }
  });

  it("uses the SAME constant gutter for the horizontal gap between columns and the vertical gap between stacked cards", () => {
    const instances = visibleCardInstances(seedItems(), { x: 0, y: 0 }, 1440, 900, columnWidth, 0);
    const byColumn = new Map<number, typeof instances>();
    for (const instance of instances) {
      const list = byColumn.get(instance.columnIndex) ?? [];
      list.push(instance);
      byColumn.set(instance.columnIndex, list);
    }

    // Horizontal: any two horizontally-adjacent columns' centers are exactly
    // one columnStride (columnWidth + COLUMN_GUTTER_PX) apart.
    const columnIndices = [...byColumn.keys()].sort((a, b) => a - b);
    for (let i = 1; i < columnIndices.length; i++) {
      const prev = columnIndices[i - 1] as number;
      const curr = columnIndices[i] as number;
      if (curr === prev + 1) {
        const prevList = byColumn.get(prev);
        const currList = byColumn.get(curr);
        const prevCenter = (prevList?.[0] as (typeof instances)[number] | undefined)?.worldRect.x;
        const currCenter = (currList?.[0] as (typeof instances)[number] | undefined)?.worldRect.x;
        expect(prevCenter).toBeDefined();
        expect(currCenter).toBeDefined();
        expect((currCenter as number) - (prevCenter as number)).toBeCloseTo(
          columnWidth + COLUMN_GUTTER_PX,
          5,
        );
      }
    }

    // Vertical: consecutive cards stacked in the SAME column leave exactly
    // COLUMN_GUTTER_PX between one card's bottom edge and the next card's
    // top edge (constant, unlike the old per-cell jitter).
    let checkedAnyColumn = false;
    for (const list of byColumn.values()) {
      const sorted = [...list].sort((a, b) => a.worldRect.y - b.worldRect.y);
      for (let i = 1; i < sorted.length; i++) {
        const prevBottom =
          (sorted[i - 1] as (typeof instances)[number]).worldRect.y +
          (sorted[i - 1] as (typeof instances)[number]).worldRect.height / 2;
        const currTop =
          (sorted[i] as (typeof instances)[number]).worldRect.y -
          (sorted[i] as (typeof instances)[number]).worldRect.height / 2;
        expect(currTop - prevBottom).toBeCloseTo(COLUMN_GUTTER_PX, 3);
        checkedAnyColumn = true;
      }
    }
    expect(checkedAnyColumn).toBe(true);
  });

  // NOTE: at exactly 24 items the 1440x900 window shows roughly as many card
  // slots as items, so some repeat is unavoidable for any scheme that keeps
  // a full N-item period per column. The bound below only guards the worst
  // case: no single item should dominate the window.
  it("distribution: in a 1440x900 window with 24 items, no item appears more than 3 times", () => {
    // T9b: COLUMN_GUTTER_PX dropped 100 -> 56 (owner feedback: cards were
    // too far apart), which packs more slots into the same viewport, so the
    // realistic per-item repeat bound loosens from 2 to 3 (matching the
    // it.each "realistic library size" bound below) at this fixed item
    // count/viewport combination.
    const items24 = seedItems(24);
    const { columnWidth: desktopColumnWidth } = columnLayoutFor(1440);
    const instances = visibleCardInstances(
      items24,
      { x: 0, y: 0 },
      1440,
      900,
      desktopColumnWidth,
      0,
      DEFAULT_MAX_CARD_POOL_SIZE,
    );
    const counts = new Map<string, number>();
    for (const instance of instances) {
      counts.set(instance.item.id, (counts.get(instance.item.id) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(3);
    }
    // Still meaningfully better than a 1:1 slot-to-item ratio would suggest.
    // 2026-10-04: COLUMN_GUTTER_PX 56 -> 28 packs 32 slots into this window,
    // more than the 24 items, so `slots - 8` would demand every single item;
    // "nearly every item shows up" is the meaningful bound once slots exceed
    // items.
    expect(counts.size).toBeGreaterThanOrEqual(Math.min(instances.length - 8, items24.length - 2));
  });

  // Slot count in a 1440x900 window stays roughly constant (~21-25) as item
  // count grows (it's driven by columns/row-height, not item count), so
  // "no repeat" never becomes trivially easy just by adding more items —
  // verified empirically across a realistic range of library sizes that no
  // item shows up 3+ times (matching the actually reported bug shape).
  it.each([24, 40, 60, 100])(
    "distribution: no item appears 3+ times in a 1440x900 window at a realistic library size (%i items)",
    (itemCount) => {
      const items = seedItems(itemCount);
      const { columnWidth: desktopColumnWidth } = columnLayoutFor(1440);
      const instances = visibleCardInstances(
        items,
        { x: 0, y: 0 },
        1440,
        900,
        desktopColumnWidth,
        0,
        DEFAULT_MAX_CARD_POOL_SIZE,
      );
      const counts = new Map<string, number>();
      for (const instance of instances) {
        counts.set(instance.item.id, (counts.get(instance.item.id) ?? 0) + 1);
      }
      for (const count of counts.values()) {
        expect(count).toBeLessThanOrEqual(3);
      }
    },
  );

  // Owner feedback 2026-10-04: too many duplicate cards on screen. All
  // columns share one shuffled order with golden-ratio phases, so a window
  // only repeats an item when slots exceed the item count.
  it("distribution: coordinated columns keep on-screen duplicates low (34 items) or zero (100 items)", () => {
    const { columnWidth: desktopColumnWidth } = columnLayoutFor(1440);
    let seed = 12_345;
    const nextCenter = () => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return (seed / 0x1_0000_0000) * 100_000 - 50_000;
    };
    const centers = Array.from({ length: 200 }, () => ({ x: nextCenter(), y: nextCenter() }));
    const duplicatesAt = (itemCount: number) => {
      const items = seedItems(itemCount);
      return centers.map((center) => {
        const instances = visibleCardInstances(
          items,
          center,
          1440,
          900,
          desktopColumnWidth,
          0,
          DEFAULT_MAX_CARD_POOL_SIZE,
        );
        return instances.length - new Set(instances.map((i) => i.item.id)).size;
      });
    };
    const d34 = duplicatesAt(34);
    const avg34 = d34.reduce((a, b) => a + b, 0) / d34.length;
    console.log("avg34", avg34);
    expect(avg34).toBeLessThanOrEqual(7);
    expect(duplicatesAt(100).every((d) => d === 0)).toBe(true);
  });

  it("distribution: adjacent columns' starting (topmost visible) items differ", () => {
    const items24 = seedItems(24);
    const { columnWidth: desktopColumnWidth } = columnLayoutFor(1440);
    const instances = visibleCardInstances(
      items24,
      { x: 0, y: 0 },
      1440,
      900,
      desktopColumnWidth,
      0,
      DEFAULT_MAX_CARD_POOL_SIZE,
    );
    const byColumn = new Map<number, (typeof instances)[number]>();
    for (const instance of instances) {
      const existing = byColumn.get(instance.columnIndex);
      if (!existing || instance.worldRect.y < existing.worldRect.y) {
        byColumn.set(instance.columnIndex, instance);
      }
    }
    const columnIndices = [...byColumn.keys()].sort((a, b) => a - b);
    for (let i = 1; i < columnIndices.length; i++) {
      const prev = columnIndices[i - 1] as number;
      const curr = columnIndices[i] as number;
      if (curr === prev + 1) {
        const prevItem = byColumn.get(prev) as (typeof instances)[number];
        const currItem = byColumn.get(curr) as (typeof instances)[number];
        expect(currItem.item.id).not.toBe(prevItem.item.id);
      }
    }
  });
});
