import { describe, expect, it } from "vitest";
import {
  ITEMS_FETCH_MAX_ITEMS,
  mergeItemsPage,
  shouldFetchNextPage,
} from "../../src/items/fetch-plan";
import { makeItem } from "../fixtures/items";

describe("shouldFetchNextPage", () => {
  it("stops when there is no next cursor", () => {
    expect(shouldFetchNextPage(10, null)).toBe(false);
  });

  it("continues when a cursor is present and under the item cap", () => {
    expect(shouldFetchNextPage(10, "cursor-abc")).toBe(true);
  });

  it("stops once the item cap is reached, even with a cursor", () => {
    expect(shouldFetchNextPage(ITEMS_FETCH_MAX_ITEMS, "cursor-abc")).toBe(false);
    expect(shouldFetchNextPage(ITEMS_FETCH_MAX_ITEMS + 50, "cursor-abc")).toBe(false);
  });
});

describe("mergeItemsPage", () => {
  it("appends new items to the existing list", () => {
    const existing = [makeItem("a"), makeItem("b")];
    const page = [makeItem("c")];
    expect(mergeItemsPage(existing, page).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("deduplicates by id (repeated items across pages)", () => {
    const existing = [makeItem("a")];
    const page = [makeItem("a"), makeItem("b")];
    expect(mergeItemsPage(existing, page).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the existing array", () => {
    const existing = [makeItem("a")];
    const originalLength = existing.length;
    mergeItemsPage(existing, [makeItem("b")]);
    expect(existing).toHaveLength(originalLength);
  });
});
