import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFilterOptions } from "../../src/filters/useFilterOptions";

vi.mock("../../src/api/endpoints", () => ({
  getCategoryTree: vi.fn(),
  getTags: vi.fn(),
}));

import { getCategoryTree, getTags } from "../../src/api/endpoints";

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
});
