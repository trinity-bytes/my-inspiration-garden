import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeItem } from "./fixtures/items";

vi.mock("../src/api/endpoints", () => ({
  listItems: vi.fn(),
  getItem: vi.fn(),
  getCategoryTree: vi.fn(),
  getTags: vi.fn(),
  getSession: vi.fn(),
}));

import { App } from "../src/App";
import { getCategoryTree, getItem, getSession, getTags, listItems } from "../src/api/endpoints";

const items = [
  makeItem("a", "text", { body: "hello" }, { title: "Item A" }),
  makeItem("b", "link", {}, { title: "Item B", url: "https://example.com/b" }),
];

describe("App: item detail modal + deep link (T9 scope B)", () => {
  beforeEach(() => {
    vi.mocked(listItems).mockResolvedValue({ items, nextCursor: null });
    vi.mocked(getSession).mockResolvedValue({ role: "visitor" });
    vi.mocked(getCategoryTree).mockResolvedValue({ categories: [] });
    vi.mocked(getTags).mockResolvedValue({ tags: [] });
    vi.mocked(getItem).mockReset();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("opens the deep-linked item's detail modal on load when it is present in the loaded items", async () => {
    window.history.replaceState({}, "", "/?item=a");

    render(<App />);

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAccessibleName("Item A"));
  });

  it("fetches and opens a deep-linked item that is not (yet) in the loaded items list", async () => {
    vi.mocked(getItem).mockResolvedValue(makeItem("deep", "text", {}, { title: "Deep linked" }));
    window.history.replaceState({}, "", "/?item=deep");

    render(<App />);

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAccessibleName("Deep linked"));
    expect(getItem).toHaveBeenCalledWith("deep");
  });

  it("closing the modal clears the ?item= query param", async () => {
    window.history.replaceState({}, "", "/?item=a");
    render(<App />);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    screen.getByRole("button", { name: "Close" }).click();

    await waitFor(() => expect(window.location.search).toBe(""));
  });
});
