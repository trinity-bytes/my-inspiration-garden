import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useItemDetail } from "../../src/detail/useItemDetail";
import { makeItem } from "../fixtures/items";

vi.mock("../../src/api/endpoints", () => ({
  getItem: vi.fn(),
}));

import { getItem } from "../../src/api/endpoints";

const items = [makeItem("a", "text"), makeItem("b", "link", {}, { url: "https://x.com/b" })];

describe("useItemDetail", () => {
  const originalPushState = window.history.pushState;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.mocked(getItem).mockReset();
  });

  afterEach(() => {
    window.history.pushState = originalPushState;
    window.history.replaceState({}, "", "/");
  });

  it("starts with nothing selected when there is no ?item= param", () => {
    const { result } = renderHook(() => useItemDetail(items, true));
    expect(result.current.selectedItem).toBeNull();
  });

  it("openItem selects an item already present in the items list and updates the URL", () => {
    const { result } = renderHook(() => useItemDetail(items, true));

    act(() => result.current.openItem("a"));

    expect(result.current.selectedItem?.id).toBe("a");
    expect(window.location.search).toBe("?item=a");
  });

  it("closeItem clears the selection and the URL", () => {
    const { result } = renderHook(() => useItemDetail(items, true));
    act(() => result.current.openItem("a"));
    act(() => result.current.closeItem());

    expect(result.current.selectedItem).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("deep link: reads ?item=<id> from the URL on mount and opens it once present in items", () => {
    window.history.replaceState({}, "", "/?item=b");
    const { result } = renderHook(() => useItemDetail(items, true));

    expect(result.current.selectedItem?.id).toBe("b");
  });

  it("deep link: fetches the item by id via the API when it isn't in the loaded items list", async () => {
    const fetched = makeItem("deep-linked", "text", {}, { title: "Fetched" });
    vi.mocked(getItem).mockResolvedValue(fetched);
    window.history.replaceState({}, "", "/?item=deep-linked");

    const { result } = renderHook(() => useItemDetail(items, true));

    await waitFor(() => expect(result.current.selectedItem?.id).toBe("deep-linked"));
    expect(getItem).toHaveBeenCalledWith("deep-linked");
  });

  it("does not fetch by id while the items list is still loading (itemsLoaded=false) — avoids a redundant request for an item the list is about to include anyway", () => {
    window.history.replaceState({}, "", "/?item=b");

    renderHook(({ loaded }) => useItemDetail(items, loaded), {
      initialProps: { loaded: false },
    });

    expect(getItem).not.toHaveBeenCalled();
  });

  it("fetches by id once itemsLoaded flips to true, if the id is still missing from the items list", async () => {
    const fetched = makeItem("deep-linked", "text", {}, { title: "Fetched" });
    vi.mocked(getItem).mockResolvedValue(fetched);
    window.history.replaceState({}, "", "/?item=deep-linked");

    const { rerender, result } = renderHook(({ loaded }) => useItemDetail(items, loaded), {
      initialProps: { loaded: false },
    });
    expect(getItem).not.toHaveBeenCalled();

    rerender({ loaded: true });

    await waitFor(() => expect(result.current.selectedItem?.id).toBe("deep-linked"));
  });

  it("popstate (browser back) closes the modal without re-pushing history", () => {
    const { result } = renderHook(() => useItemDetail(items, true));
    act(() => result.current.openItem("a"));
    expect(window.location.search).toBe("?item=a");

    act(() => {
      window.history.back();
      // jsdom's history.back() is async internally; simulate the resulting
      // popstate synchronously the way a real browser would deliver it.
      window.history.replaceState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.selectedItem).toBeNull();
  });
});
