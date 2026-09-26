import { describe, expect, it, vi } from "vitest";
import {
  getCategoriesVersion,
  invalidateCategories,
  subscribeCategoriesVersion,
} from "../../src/categories/categories-store";

describe("categories-store (T11b B6 shared invalidation)", () => {
  it("bumps the version and notifies subscribers on invalidateCategories, but not after unsubscribing", () => {
    const before = getCategoriesVersion();
    const listener = vi.fn();
    const unsubscribe = subscribeCategoriesVersion(listener);

    invalidateCategories();

    expect(getCategoriesVersion()).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    invalidateCategories();

    expect(getCategoriesVersion()).toBe(before + 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
