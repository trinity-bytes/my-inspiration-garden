import { describe, expect, it } from "vitest";
import {
  ITEMS_FETCH_MAX_ITEMS,
  ITEMS_FETCH_MAX_PAGES,
  mergeItemsPage,
  shouldFetchNextPage,
} from "../../src/items/fetch-plan";
import { makeItem } from "../fixtures/items";

/** A "normal" in-range page result — each test overrides just the field it's exercising. */
function page(overrides: Partial<Parameters<typeof shouldFetchNextPage>[0]> = {}) {
  return {
    itemsSoFar: 10,
    nextCursor: "cursor-2",
    requestCursor: "cursor-1",
    pagesSoFar: 2,
    addedCount: 5,
    ...overrides,
  };
}

describe("shouldFetchNextPage", () => {
  it("stops when there is no next cursor", () => {
    expect(shouldFetchNextPage(page({ nextCursor: null }))).toBe(false);
  });

  it("continues when a cursor is present and every other condition is healthy", () => {
    expect(shouldFetchNextPage(page())).toBe(true);
  });

  it("stops once the item cap is reached, even with a cursor", () => {
    expect(shouldFetchNextPage(page({ itemsSoFar: ITEMS_FETCH_MAX_ITEMS }))).toBe(false);
    expect(shouldFetchNextPage(page({ itemsSoFar: ITEMS_FETCH_MAX_ITEMS + 50 }))).toBe(false);
  });

  it("stops once the page cap is reached, even with a cursor and items under the item cap", () => {
    expect(shouldFetchNextPage(page({ pagesSoFar: ITEMS_FETCH_MAX_PAGES }))).toBe(false);
    expect(shouldFetchNextPage(page({ pagesSoFar: ITEMS_FETCH_MAX_PAGES + 3 }))).toBe(false);
  });

  it("stops when the cursor repeats (server returned the same cursor it was given — would loop forever)", () => {
    expect(
      shouldFetchNextPage(page({ requestCursor: "same", nextCursor: "same" })),
    ).toBe(false);
  });

  it("stops when a page added no new unique items (progress stalled even though the cursor moved)", () => {
    expect(shouldFetchNextPage(page({ addedCount: 0 }))).toBe(false);
  });

  it("continues on the very first page (requestCursor null, distinct from a real repeated cursor)", () => {
    expect(shouldFetchNextPage(page({ requestCursor: null, pagesSoFar: 1 }))).toBe(true);
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
