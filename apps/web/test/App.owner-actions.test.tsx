import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeItem } from "./fixtures/items";

vi.mock("../src/api/endpoints", () => ({
  listItems: vi.fn(),
  getItem: vi.fn(),
  getCategoryTree: vi.fn(),
  getTags: vi.fn(),
  getSession: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  restoreItem: vi.fn(),
  listItemRevisions: vi.fn(),
  restoreItemRevision: vi.fn(),
  unfurlLink: vi.fn(),
  uploadMedia: vi.fn(),
  importMedia: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

import { App } from "../src/App";
import {
  createCategory,
  createItem,
  deleteItem,
  getCategoryTree,
  getItem,
  getSession,
  getTags,
  listItemRevisions,
  listItems,
  restoreItem,
  restoreItemRevision,
  updateItem,
} from "../src/api/endpoints";

const items = [makeItem("a", "text", { body: "hello" }, { title: "Item A" })];

describe("App: owner quick-add / edit / history / trash (T11)", () => {
  beforeEach(() => {
    vi.mocked(listItems).mockResolvedValue({ items, nextCursor: null });
    vi.mocked(getSession).mockResolvedValue({ role: "owner" });
    vi.mocked(getCategoryTree).mockResolvedValue({ categories: [] });
    vi.mocked(getTags).mockResolvedValue({ tags: [] });
    vi.mocked(getItem).mockReset();
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("opens the quick-add modal from the navbar and creates an item, refetching the canvas", async () => {
    vi.mocked(createItem).mockResolvedValue({ id: "new1" } as never);
    render(<App />);

    const addButton = await screen.findByRole("button", { name: "Add item" });
    fireEvent.click(addButton);

    const dialog = screen.getByRole("dialog", { name: "Add item" });
    fireEvent.change(within(dialog).getByLabelText("Body"), { target: { value: "hello garden" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listItems).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add item" })).not.toBeInTheDocument(),
    );
  });

  it("opens the trash modal from the navbar and restores an item, refetching the canvas", async () => {
    vi.mocked(listItems).mockImplementation(async (params) =>
      params && "deletedOnly" in params && params.deletedOnly
        ? { items: [makeItem("t1", "text", {}, { title: "Trashed" })], nextCursor: null }
        : { items, nextCursor: null },
    );
    vi.mocked(restoreItem).mockResolvedValue(items[0] as never);
    render(<App />);

    const trashButton = await screen.findByRole("button", { name: "Trash" });
    fireEvent.click(trashButton);

    const dialog = await screen.findByRole("dialog", { name: "Trash" });
    await within(dialog).findByText("Trashed");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(restoreItem).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(within(dialog).getByText(/trash is empty/i)).toBeInTheDocument());
    await waitFor(() => expect(vi.mocked(listItems).mock.calls.length).toBeGreaterThan(1));
  });

  it("opens the category manager from the navbar, creates a category, and refreshes the picker without reload (T11b B6)", async () => {
    const newCategory = {
      id: "c1",
      name: "Palettes",
      slug: "palettes",
      parentId: null,
      position: 0,
    };
    vi.mocked(getCategoryTree).mockResolvedValue({ categories: [] });
    vi.mocked(createCategory).mockResolvedValue(newCategory);
    render(<App />);

    const categoriesButton = await screen.findByRole("button", { name: "Categories" });
    fireEvent.click(categoriesButton);

    const dialog = await screen.findByRole("dialog", { name: "Categories" });
    // Every `useCategories`/`useFilterOptions`/`useCategoryNames` instance
    // refetches on `invalidateCategories()`, not just the one feeding this
    // modal's prop — replace the persistent mock (not `...Once`) so whichever
    // of them calls first still gets the post-create list.
    vi.mocked(getCategoryTree).mockResolvedValue({ categories: [newCategory] });
    fireEvent.change(within(dialog).getByLabelText("New top-level category"), {
      target: { value: "Palettes" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add top-level category" }));

    await waitFor(() =>
      expect(createCategory).toHaveBeenCalledWith({ name: "Palettes", parentId: null }),
    );
    // The shared invalidation signal (categories-store) re-triggers
    // `useCategories`'s fetch in `App`, so the picker updates without a
    // page reload once the (mocked) refetch resolves.
    await waitFor(() =>
      expect(within(dialog).getByText("Palettes", { selector: ".category-manager__name" })),
    );
  });

  it("edits the deep-linked item from its detail modal and refetches, closing both modals", async () => {
    window.history.replaceState({}, "", "/?item=a");
    vi.mocked(updateItem).mockResolvedValue({ ...items[0], title: "Renamed" } as never);
    render(<App />);

    const detailDialog = await screen.findByRole("dialog", { name: "Item A" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "Edit" }));

    const editDialog = screen.getByRole("dialog", { name: "Edit item" });
    fireEvent.change(within(editDialog).getByLabelText("Title"), { target: { value: "Renamed" } });
    fireEvent.click(within(editDialog).getByRole("button", { name: "Save changes" }));

    const listItemsCallsBefore = vi.mocked(listItems).mock.calls.length;
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith("a", expect.objectContaining({ title: "Renamed" })),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit item" })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Item A" })).not.toBeInTheDocument(),
    );
    expect(vi.mocked(listItems).mock.calls.length).toBeGreaterThan(listItemsCallsBefore);
  });

  it("opens revision history from the detail modal and restores a revision, refetching and closing both modals", async () => {
    window.history.replaceState({}, "", "/?item=a");
    vi.mocked(listItemRevisions).mockResolvedValue({
      revisions: [
        {
          id: "rev-1",
          itemId: "a",
          snapshot: items[0] as never,
          actor: "web",
          createdAt: "2026-09-23T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(restoreItemRevision).mockResolvedValue(items[0] as never);
    render(<App />);

    const detailDialog = await screen.findByRole("dialog", { name: "Item A" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "History" }));

    const historyDialog = await screen.findByRole("dialog", { name: "Revision history" });
    await within(historyDialog).findByRole("button", { name: "Restore" });
    fireEvent.click(within(historyDialog).getByRole("button", { name: "Restore" }));

    const listItemsCallsBefore = vi.mocked(listItems).mock.calls.length;
    await waitFor(() => expect(restoreItemRevision).toHaveBeenCalledWith("a", "rev-1"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Revision history" })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Item A" })).not.toBeInTheDocument(),
    );
    expect(vi.mocked(listItems).mock.calls.length).toBeGreaterThan(listItemsCallsBefore);
  });

  it("moves the deep-linked item to trash from its detail modal, refetching and closing it", async () => {
    window.history.replaceState({}, "", "/?item=a");
    vi.mocked(deleteItem).mockResolvedValue({
      ...items[0],
      deletedAt: "2026-09-26T00:00:00.000Z",
    } as never);
    render(<App />);

    const detailDialog = await screen.findByRole("dialog", { name: "Item A" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "Move to trash" }));
    const confirmDialog = await screen.findByRole("dialog", { name: /move to trash/i });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Move to trash" }));

    const listItemsCallsBefore = vi.mocked(listItems).mock.calls.length;
    await waitFor(() => expect(deleteItem).toHaveBeenCalledWith("a"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Item A" })).not.toBeInTheDocument(),
    );
    expect(vi.mocked(listItems).mock.calls.length).toBeGreaterThan(listItemsCallsBefore);
  });
});
