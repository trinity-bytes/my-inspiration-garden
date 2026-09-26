import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrashModal } from "../../src/trash/TrashModal";

function makeTrashedItem(id: string, title: string) {
  return {
    id,
    kind: "text" as const,
    title,
    source: "web",
    categoryIds: [],
    tags: [],
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
    deletedAt: "2026-09-25T00:00:00.000Z",
    data: { body: "trashed body" },
  };
}

describe("TrashModal", () => {
  it("loads and lists trashed items", async () => {
    const listItems = vi.fn().mockResolvedValue({
      items: [makeTrashedItem("t1", "Trashed one"), makeTrashedItem("t2", "Trashed two")],
      nextCursor: null,
    });
    render(<TrashModal onClose={vi.fn()} onRestored={vi.fn()} listItems={listItems} />);

    expect(screen.getByRole("dialog", { name: "Trash" })).toBeInTheDocument();
    await screen.findByText("Trashed one");
    expect(screen.getByText("Trashed two")).toBeInTheDocument();
    expect(listItems).toHaveBeenCalledWith({ deletedOnly: true, limit: 100 });
  });

  it("restores a trashed item and notifies the caller", async () => {
    const listItems = vi.fn().mockResolvedValue({
      items: [makeTrashedItem("t1", "Trashed one")],
      nextCursor: null,
    });
    const restoreItem = vi
      .fn()
      .mockResolvedValue({ ...makeTrashedItem("t1", "Trashed one"), deletedAt: undefined });
    const onRestored = vi.fn();
    render(
      <TrashModal
        onClose={vi.fn()}
        onRestored={onRestored}
        listItems={listItems}
        restoreItem={restoreItem}
      />,
    );

    await screen.findByText("Trashed one");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(restoreItem).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Trashed one")).not.toBeInTheDocument();
  });

  it("shows an empty state when the trash is empty", async () => {
    const listItems = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    render(<TrashModal onClose={vi.fn()} onRestored={vi.fn()} listItems={listItems} />);

    expect(await screen.findByText(/trash is empty/i)).toBeInTheDocument();
  });
});
