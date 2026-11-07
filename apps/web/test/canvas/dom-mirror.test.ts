import { describe, expect, it } from "vitest";
import { DomMirrorTracker, selectDomMirrorCards } from "../../src/canvas/dom-mirror";
import type { CardInstance } from "../../src/canvas/item-layout";
import { makeItem } from "../fixtures/items";

function instance(key: string, x: number, y: number): CardInstance {
  return {
    key,
    columnIndex: 0,
    row: 0,
    item: makeItem(key, "text"),
    worldRect: { x, y, width: 100, height: 100 },
  };
}

describe("selectDomMirrorCards", () => {
  it("sorts cards in reading order: top-to-bottom, then left-to-right", () => {
    const cards = [instance("c", 0, 100), instance("a", 0, 0), instance("b", 100, 0)];
    const sorted = selectDomMirrorCards(cards, 10);
    expect(sorted.map((card) => card.key)).toEqual(["a", "b", "c"]);
  });

  it("caps the number of entries", () => {
    const cards = Array.from({ length: 20 }, (_, i) => instance(`k${i}`, i * 10, 0));
    const sorted = selectDomMirrorCards(cards, 5);
    expect(sorted).toHaveLength(5);
  });

  it("is deterministic and does not mutate the input array", () => {
    const cards = [instance("c", 0, 100), instance("a", 0, 0)];
    const original = [...cards];
    selectDomMirrorCards(cards, 10);
    expect(cards).toEqual(original);
  });

  it("returns an empty list for an empty input", () => {
    expect(selectDomMirrorCards([], 10)).toEqual([]);
  });
});

describe("DomMirrorTracker", () => {
  it("reports the first non-empty selection and nothing while the visible set is unchanged", () => {
    const tracker = new DomMirrorTracker(10);
    expect(tracker.update([])).toBeNull();
    const cards = [instance("b", 100, 0), instance("a", 0, 0)];
    expect(tracker.update(cards)?.map((card) => card.key)).toEqual(["a", "b"]);
    expect(tracker.update(cards)).toBeNull();
    expect(tracker.update([...cards])).toBeNull();
  });

  it("skips the sort entirely when the same instances are visible again", () => {
    const tracker = new DomMirrorTracker(10);
    let reads = 0;
    const watched = instance("w", 0, 0);
    const rect = watched.worldRect;
    Object.defineProperty(watched, "worldRect", {
      get: () => {
        reads++;
        return rect;
      },
    });
    const cards = [instance("z", 0, 50), watched];
    tracker.update(cards);
    reads = 0;
    tracker.update(cards);
    expect(reads).toBe(0);
  });

  it("reports a change when a cell resolves to a new instance (an edited item) with the same key", () => {
    const tracker = new DomMirrorTracker(10);
    tracker.update([instance("a", 0, 0)]);
    const replaced = instance("a", 0, 0);
    expect(tracker.update([replaced])).toEqual([replaced]);
  });

  it("ignores visible-set changes that leave the capped mirror unchanged", () => {
    const tracker = new DomMirrorTracker(1);
    const first = instance("a", 0, 0);
    tracker.update([first, instance("b", 0, 100)]);
    expect(tracker.update([first, instance("c", 0, 200)])).toBeNull();
  });
});
