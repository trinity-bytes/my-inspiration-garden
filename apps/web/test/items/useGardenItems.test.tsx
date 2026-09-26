import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultFilterState } from "../../src/filters/filter-state";
import { makeItem } from "../fixtures/items";

/**
 * `useGardenItems`'s `cancelled` guard exists to stop it from calling
 * `setItems`/`setStatus` after unmount. Asserting on `result.current`
 * after a real `unmount()` can't tell a working guard from a removed one:
 * React itself silently drops any state update on an unmounted tree
 * regardless of the guard (verified directly — deleting the `if
 * (!cancelled)` checks from the source still left `result.current.status`
 * at `"loading"`, unchanged). Spying on the `useState` setters instead
 * catches it: the guard runs before the setter is ever CALLED, in our own
 * code, before React gets a chance to decide whether the update lands — so
 * with the guard removed, the wrapped setter records a call after unmount
 * even though `result.current` itself never changes.
 */
const stateSetters: ReturnType<typeof vi.fn>[] = [];

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [value, setValue] = actual.useState(initial);
      const spied = vi.fn(setValue);
      stateSetters.push(spied);
      return [value, spied] as const;
    },
  };
});

vi.mock("../../src/api/endpoints", () => ({
  listItems: vi.fn(),
}));

import { listItems } from "../../src/api/endpoints";
import { useGardenItems } from "../../src/items/useGardenItems";

describe("useGardenItems", () => {
  // `mockResolvedValueOnce` queues on top of whatever implementation a
  // previous test left as the mock's fallback, and `vi.restoreAllMocks()`
  // (unlike `resetAllMocks`) does not clear that for a plain `vi.fn()` — so
  // each test starts from a clean mock instead of inheriting the previous
  // test's resolved/rejected value.
  beforeEach(() => {
    vi.mocked(listItems).mockReset();
    stateSetters.length = 0;
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

  it("stops paginating when the API returns the same cursor it was given (stuck cursor, would otherwise loop forever)", async () => {
    vi.mocked(listItems)
      .mockResolvedValueOnce({ items: [makeItem("a")], nextCursor: "stuck" })
      .mockResolvedValueOnce({ items: [makeItem("b")], nextCursor: "stuck" })
      // Would be called again forever if the guard didn't stop after the
      // second page (requestCursor "stuck" === nextCursor "stuck").
      .mockResolvedValueOnce({ items: [makeItem("c")], nextCursor: "stuck" });

    const { result } = renderHook(() => useGardenItems());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(listItems).toHaveBeenCalledTimes(2);
  });

  it("stops paginating once a page adds no new unique items, even with a fresh cursor", async () => {
    vi.mocked(listItems)
      .mockResolvedValueOnce({ items: [makeItem("a")], nextCursor: "page-2" })
      // Every item in this page was already collected — no progress.
      .mockResolvedValueOnce({ items: [makeItem("a")], nextCursor: "page-3" });

    const { result } = renderHook(() => useGardenItems());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items.map((item) => item.id)).toEqual(["a"]);
    expect(listItems).toHaveBeenCalledTimes(2);
  });

  it("does not call a state setter after unmount (deferred fetch resolves after unmount)", async () => {
    let resolvePage!: (value: { items: ReturnType<typeof makeItem>[]; nextCursor: null }) => void;
    vi.mocked(listItems).mockReturnValue(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );

    const { unmount } = renderHook(() => useGardenItems());
    // Captures this render's setItems/setStatus specifically, so a later
    // test's setters (stateSetters is shared, reset in beforeEach) can
    // never be mistaken for this one's.
    const settersFromThisRender = [...stateSetters];
    expect(settersFromThisRender.length).toBeGreaterThan(0);

    unmount();
    resolvePage({ items: [makeItem("a")], nextCursor: null });
    // Flush the microtask queue the resolved promise's `await` continues on.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    for (const setter of settersFromThisRender) {
      expect(setter).not.toHaveBeenCalled();
    }
  });

  it("passes the given filters through to listItems alongside pagination params", async () => {
    vi.mocked(listItems).mockResolvedValue({ items: [], nextCursor: null });

    renderHook(() =>
      useGardenItems({ ...defaultFilterState(), kinds: ["image"], tags: ["ui"], q: "sunset" }),
    );

    await waitFor(() => expect(listItems).toHaveBeenCalled());
    expect(listItems).toHaveBeenCalledWith(
      expect.objectContaining({ kind: ["image"], tag: ["ui"], q: "sunset" }),
    );
  });

  it("refetches from scratch when the filters change", async () => {
    vi.mocked(listItems).mockResolvedValue({ items: [makeItem("a")], nextCursor: null });

    const { result, rerender } = renderHook(({ filters }) => useGardenItems(filters), {
      initialProps: { filters: defaultFilterState() },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(listItems).toHaveBeenCalledTimes(1);

    vi.mocked(listItems).mockResolvedValue({ items: [makeItem("b")], nextCursor: null });
    rerender({ filters: { ...defaultFilterState(), kinds: ["text"] } });

    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(["b"]));
    expect(listItems).toHaveBeenCalledTimes(2);
  });

  it("re-fetches on demand via refetch (T11: reflect a write without changing filters)", async () => {
    vi.mocked(listItems).mockResolvedValue({ items: [makeItem("a")], nextCursor: null });

    const { result } = renderHook(() => useGardenItems());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(listItems).toHaveBeenCalledTimes(1);

    vi.mocked(listItems).mockResolvedValue({
      items: [makeItem("a"), makeItem("b")],
      nextCursor: null,
    });
    result.current.refetch();

    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(["a", "b"]));
    expect(listItems).toHaveBeenCalledTimes(2);
  });
});
