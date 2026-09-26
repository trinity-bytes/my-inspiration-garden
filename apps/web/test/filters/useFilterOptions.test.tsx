import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFilterOptions } from "../../src/filters/useFilterOptions";

vi.mock("../../src/api/endpoints", () => ({
  getCategoryTree: vi.fn(),
  getTags: vi.fn(),
}));

import { getCategoryTree, getTags } from "../../src/api/endpoints";
import { invalidateCategories } from "../../src/categories/categories-store";

describe("useFilterOptions", () => {
  it("starts empty and fills in categories and tags once both loads resolve", async () => {
    vi.mocked(getCategoryTree).mockResolvedValue({
      categories: [
        { id: "c1", name: "Illustration", slug: "illustration", parentId: null, position: 0 },
      ],
    });
    vi.mocked(getTags).mockResolvedValue({ tags: [{ id: "t1", name: "ui", count: 2 }] });

    const { result } = renderHook(() => useFilterOptions());
    expect(result.current).toEqual({ categories: [], tags: [] });

    await waitFor(() =>
      expect(result.current).toEqual({
        categories: [
          { id: "c1", name: "Illustration", slug: "illustration", parentId: null, position: 0 },
        ],
        tags: [{ id: "t1", name: "ui", count: 2 }],
      }),
    );
  });

  it("keeps whichever list resolved when the other fetch fails", async () => {
    vi.mocked(getCategoryTree).mockRejectedValue(new Error("network"));
    vi.mocked(getTags).mockResolvedValue({ tags: [{ id: "t1", name: "ui", count: 1 }] });

    const { result } = renderHook(() => useFilterOptions());

    await waitFor(() => expect(result.current.tags).toEqual([{ id: "t1", name: "ui", count: 1 }]));
    expect(result.current.categories).toEqual([]);
  });

  it("refetches categories (not tags) after invalidateCategories() is called (T11b B6 manager invalidation)", async () => {
    const tags = [{ id: "t1", name: "ui", count: 1 }];
    vi.mocked(getCategoryTree).mockResolvedValue({
      categories: [{ id: "c1", name: "First", slug: "first", parentId: null, position: 0 }],
    });
    vi.mocked(getTags).mockResolvedValue({ tags });

    const { result } = renderHook(() => useFilterOptions());
    await waitFor(() =>
      expect(result.current.categories).toEqual([
        { id: "c1", name: "First", slug: "first", parentId: null, position: 0 },
      ]),
    );

    vi.mocked(getCategoryTree).mockResolvedValue({
      categories: [{ id: "c2", name: "Second", slug: "second", parentId: null, position: 0 }],
    });
    invalidateCategories();

    await waitFor(() =>
      expect(result.current.categories).toEqual([
        { id: "c2", name: "Second", slug: "second", parentId: null, position: 0 },
      ]),
    );
    expect(result.current.tags).toEqual(tags);
  });
});
