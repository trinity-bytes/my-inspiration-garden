import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/api/endpoints", () => ({
  getCategoryTree: vi.fn(),
}));

import { getCategoryTree } from "../../src/api/endpoints";
import { invalidateCategories } from "../../src/categories/categories-store";
import { useCategories } from "../../src/forms/useCategories";

describe("useCategories", () => {
  it("loads the flat category list", async () => {
    const category = {
      id: "c1",
      name: "Illustration",
      slug: "illustration",
      parentId: null,
      position: 0,
    };
    vi.mocked(getCategoryTree).mockResolvedValue({ categories: [category] });

    const { result } = renderHook(() => useCategories());
    expect(result.current).toEqual([]);

    await waitFor(() => expect(result.current).toEqual([category]));
  });

  it("fails soft to an empty list on error", async () => {
    vi.mocked(getCategoryTree).mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useCategories());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toEqual([]);
  });

  it("refetches after invalidateCategories() is called (T11b B6 manager invalidation)", async () => {
    const first = { id: "c1", name: "First", slug: "first", parentId: null, position: 0 };
    const second = { id: "c2", name: "Second", slug: "second", parentId: null, position: 0 };
    vi.mocked(getCategoryTree).mockResolvedValue({ categories: [first] });

    const { result } = renderHook(() => useCategories());
    await waitFor(() => expect(result.current).toEqual([first]));

    vi.mocked(getCategoryTree).mockResolvedValue({ categories: [second] });
    invalidateCategories();

    await waitFor(() => expect(result.current).toEqual([second]));
  });
});
