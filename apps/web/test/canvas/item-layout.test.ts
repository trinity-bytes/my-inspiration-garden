import { describe, expect, it } from "vitest";
import {
  CARD_ASPECT_MAX,
  CARD_ASPECT_MIN,
  CARD_CELL_SIZE,
  CARD_WIDTH_MAX_FRACTION,
  cardAspectForItem,
  cardSizeForItem,
  cardWorldRect,
  itemIndexForCell,
  visibleCardInstances,
} from "../../src/canvas/item-layout";
import { makeItem } from "../fixtures/items";

describe("itemIndexForCell", () => {
  it("is a pure function of (cellX, cellY, itemCount): identical inputs give identical output", () => {
    expect(itemIndexForCell(5, -3, 10)).toBe(itemIndexForCell(5, -3, 10));
  });

  it("always returns an index within [0, itemCount)", () => {
    for (let x = -30; x < 30; x++) {
      for (let y = -5; y < 5; y++) {
        const index = itemIndexForCell(x, y, 7);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(7);
      }
    }
  });

  it("visits more than one index across many cells (repetition, not a constant map)", () => {
    const seen = new Set<number>();
    for (let x = 0; x < 40; x++) {
      seen.add(itemIndexForCell(x, 0, 5));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

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

describe("cardSizeForItem", () => {
  it("keeps the larger dimension within CARD_CELL_SIZE * CARD_WIDTH_MAX_FRACTION", () => {
    for (let i = 0; i < 30; i++) {
      const item = makeItem(`s${i}`, "image", { width: 100, height: 100 });
      const { width, height } = cardSizeForItem(item, CARD_CELL_SIZE);
      expect(Math.max(width, height)).toBeLessThanOrEqual(
        CARD_CELL_SIZE * CARD_WIDTH_MAX_FRACTION + 1e-6,
      );
    }
  });

  it("preserves the item's aspect ratio", () => {
    const item = makeItem("s-aspect", "image", { width: 300, height: 200 });
    const { width, height } = cardSizeForItem(item, CARD_CELL_SIZE);
    expect(width / height).toBeCloseTo(cardAspectForItem(item), 5);
  });

  it("is deterministic and varies by item id (mixed sizes)", () => {
    const a = cardSizeForItem(makeItem("size-a", "text"), CARD_CELL_SIZE);
    const b = cardSizeForItem(makeItem("size-b", "text"), CARD_CELL_SIZE);
    expect(cardSizeForItem(makeItem("size-a", "text"), CARD_CELL_SIZE)).toEqual(a);
    expect(a).not.toEqual(b);
  });
});

describe("cardWorldRect", () => {
  it("keeps the card's center within its own cell bounds", () => {
    const item = makeItem("rect1", "text");
    const rect = cardWorldRect(2, -3, item, CARD_CELL_SIZE);
    const cellCenterX = 2 * CARD_CELL_SIZE + CARD_CELL_SIZE / 2;
    const cellCenterY = -3 * CARD_CELL_SIZE + CARD_CELL_SIZE / 2;
    expect(Math.abs(rect.x - cellCenterX)).toBeLessThanOrEqual(CARD_CELL_SIZE / 2);
    expect(Math.abs(rect.y - cellCenterY)).toBeLessThanOrEqual(CARD_CELL_SIZE / 2);
  });

  it("never lets the card footprint spill outside its cell (no cross-cell overlap)", () => {
    for (let x = -10; x < 10; x++) {
      for (let y = -3; y < 3; y++) {
        const item = makeItem(`spill-${x}-${y}`, "video");
        const rect = cardWorldRect(x, y, item, CARD_CELL_SIZE);
        const cellMinX = x * CARD_CELL_SIZE;
        const cellMaxX = (x + 1) * CARD_CELL_SIZE;
        const cellMinY = y * CARD_CELL_SIZE;
        const cellMaxY = (y + 1) * CARD_CELL_SIZE;
        expect(rect.x - rect.width / 2).toBeGreaterThanOrEqual(cellMinX - 1e-6);
        expect(rect.x + rect.width / 2).toBeLessThanOrEqual(cellMaxX + 1e-6);
        expect(rect.y - rect.height / 2).toBeGreaterThanOrEqual(cellMinY - 1e-6);
        expect(rect.y + rect.height / 2).toBeLessThanOrEqual(cellMaxY + 1e-6);
      }
    }
  });

  it("is deterministic for the same cell and item", () => {
    const item = makeItem("rect-det", "font");
    expect(cardWorldRect(1, 1, item, CARD_CELL_SIZE)).toEqual(
      cardWorldRect(1, 1, item, CARD_CELL_SIZE),
    );
  });
});

describe("visibleCardInstances", () => {
  const items = [
    makeItem("a", "image"),
    makeItem("b", "link"),
    makeItem("c", "text"),
    makeItem("d", "video"),
  ];

  it("returns nothing when there are no items", () => {
    expect(visibleCardInstances([], { x: 0, y: 0 }, 1000, 800, 1, 100)).toEqual([]);
  });

  it("is deterministic: identical inputs produce identical output (same items -> same layout)", () => {
    const a = visibleCardInstances(items, { x: 0, y: 0 }, 1000, 800, 1, 100);
    const b = visibleCardInstances(items, { x: 0, y: 0 }, 1000, 800, 1, 100);
    expect(a).toEqual(b);
  });

  it("every returned instance's item comes from the input items array (repetition allowed)", () => {
    const instances = visibleCardInstances(items, { x: 0, y: 0 }, 1000, 800, 1, 200);
    const ids = new Set(items.map((item) => item.id));
    for (const instance of instances) {
      expect(ids.has(instance.item.id)).toBe(true);
    }
  });

  it("repeats the single item across many cells when only one item exists", () => {
    const single = [makeItem("only", "palette")];
    const instances = visibleCardInstances(single, { x: 0, y: 0 }, 1200, 900, 1, 200);
    expect(instances.length).toBeGreaterThan(1);
    for (const instance of instances) {
      expect(instance.item.id).toBe("only");
    }
  });

  it("respects the maxPoolSize cap", () => {
    const instances = visibleCardInstances(items, { x: 0, y: 0 }, 4000, 4000, 3, 25);
    expect(instances.length).toBeLessThanOrEqual(25);
  });

  it("shifts which cells are visible as the viewport center moves", () => {
    const near = visibleCardInstances(items, { x: 0, y: 0 }, 800, 600, 1, 100);
    const far = visibleCardInstances(items, { x: 5000, y: 0 }, 800, 600, 1, 100);
    const nearKeys = new Set(near.map((instance) => instance.key));
    const farKeys = new Set(far.map((instance) => instance.key));
    const overlap = [...nearKeys].filter((key) => farKeys.has(key));
    expect(overlap.length).toBe(0);
  });
});
