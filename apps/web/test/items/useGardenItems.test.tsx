import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGardenItems } from "../../src/items/useGardenItems";
import { makeItem } from "../fixtures/items";

vi.mock("../../src/api/endpoints", () => ({
  listItems: vi.fn(),
}));

import { listItems } from "../../src/api/endpoints";

describe("useGardenItems", () => {
  // `mockResolvedValueOnce` queues on top of whatever implementation a
  // previous test left as the mock's fallback, and `vi.restoreAllMocks()`
  // (unlike `resetAllMocks`) does not clear that for a plain `vi.fn()` — so
  // each test starts from a clean mock instead of inheriting the previous
  // test's resolved/rejected value.
  beforeEach(() => {
    vi.mocked(listItems).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts loading, then resolves to ready with the fetched items", async () => {
    vi.mocked(listItems).mockResolvedValue({
      items: [makeItem("a"), makeItem("b")],
      nextCursor: null,
    });

    const { result } = renderHook(() => useGardenItems());
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("resolves to empty when the API returns no items", async () => {
    vi.mocked(listItems).mockResolvedValue({ items: [], nextCursor: null });

    const { result } = renderHook(() => useGardenItems());
    await waitFor(() => expect(result.current.status).toBe("empty"));
    expect(result.current.items).toEqual([]);
  });

  it("resolves to error when the fetch fails", async () => {
    vi.mocked(listItems).mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useGardenItems());
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("paginates across multiple pages until the cursor is exhausted", async () => {
    vi.mocked(listItems)
      .mockResolvedValueOnce({ items: [makeItem("a")], nextCursor: "page-2" })
      .mockResolvedValueOnce({ items: [makeItem("b")], nextCursor: null });

    const { result } = renderHook(() => useGardenItems());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(listItems).toHaveBeenCalledTimes(2);
  });

  it("does not update state after unmount", async () => {
    let resolvePage!: (value: { items: ReturnType<typeof makeItem>[]; nextCursor: null }) => void;
    vi.mocked(listItems).mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useGardenItems());
    unmount();
    resolvePage({ items: [], nextCursor: null });
    await Promise.resolve();

    expect(result.current.status).toBe("loading");
  });
});
