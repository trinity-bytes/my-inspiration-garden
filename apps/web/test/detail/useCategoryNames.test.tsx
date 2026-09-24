import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCategoryNames } from "../../src/detail/useCategoryNames";

vi.mock("../../src/api/endpoints", () => ({
  getCategoryTree: vi.fn(),
}));

import { getCategoryTree } from "../../src/api/endpoints";

describe("useCategoryNames", () => {
  it("starts empty and fills in id -> name once the category tree loads", async () => {
    vi.mocked(getCategoryTree).mockResolvedValue({
      categories: [
        { id: "c1", name: "Illustration", slug: "illustration", parentId: null, position: 0 },
        { id: "c2", name: "Typography", slug: "typography", parentId: "c1", position: 0 },
      ],
    });

    const { result } = renderHook(() => useCategoryNames());
    expect(result.current).toEqual({});

    await waitFor(() => expect(result.current).toEqual({ c1: "Illustration", c2: "Typography" }));
  });

  it("stays empty (does not throw) when the fetch fails", async () => {
    vi.mocked(getCategoryTree).mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useCategoryNames());

    await waitFor(() => expect(getCategoryTree).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });
});
