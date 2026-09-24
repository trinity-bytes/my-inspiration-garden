import { describe, expect, it } from "vitest";
import { selectDomMirrorCards } from "../../src/canvas/dom-mirror";
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
