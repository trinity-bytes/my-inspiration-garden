import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RevisionHistoryModal } from "../../src/forms/RevisionHistoryModal";

const item = {
  id: "01HZY3Q3G0K8R4S8T2V6W0X4Y6",
  kind: "text" as const,
  title: "Existing",
  source: "web",
  categoryIds: [],
  tags: [],
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
  data: { body: "existing body" },
};

const revisions = [
  {
    id: "rev-2",
    itemId: item.id,
    snapshot: { ...item, title: "Newer title" },
    actor: "owner",
    createdAt: "2026-09-25T00:00:00.000Z",
  },
  {
    id: "rev-1",
    itemId: item.id,
    snapshot: { ...item, title: "Older title" },
    actor: "web",
    createdAt: "2026-09-23T00:00:00.000Z",
  },
];

describe("RevisionHistoryModal", () => {
  it("loads and lists revisions newest first with actor and timestamp", async () => {
    const listItemRevisions = vi.fn().mockResolvedValue({ revisions });
    render(
      <RevisionHistoryModal
        item={item}
        onClose={vi.fn()}
        onRestored={vi.fn()}
        listItemRevisions={listItemRevisions}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Revision history" })).toBeInTheDocument();
    await screen.findByText("Newer title");
    expect(listItemRevisions).toHaveBeenCalledWith(item.id);
    const listItemsText = screen.getAllByRole("listitem").map((el) => el.textContent);
    expect(listItemsText[0]).toContain("Newer title");
    expect(listItemsText[1]).toContain("Older title");
  });

  it("restores a revision and notifies the caller", async () => {
    const listItemRevisions = vi.fn().mockResolvedValue({ revisions });
    const restoreItemRevision = vi.fn().mockResolvedValue({ ...item, title: "Older title" });
    const onRestored = vi.fn();
    const onClose = vi.fn();
    render(
      <RevisionHistoryModal
        item={item}
        onClose={onClose}
        onRestored={onRestored}
        listItemRevisions={listItemRevisions}
        restoreItemRevision={restoreItemRevision}
      />,
    );

    await screen.findByText("Older title");
    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(restoreButtons[1] as HTMLElement);

    await waitFor(() => expect(restoreItemRevision).toHaveBeenCalledWith(item.id, "rev-1"));
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when there are no revisions", async () => {
    const listItemRevisions = vi.fn().mockResolvedValue({ revisions: [] });
    render(
      <RevisionHistoryModal
        item={item}
        onClose={vi.fn()}
        onRestored={vi.fn()}
        listItemRevisions={listItemRevisions}
      />,
    );

    expect(await screen.findByText(/no revisions/i)).toBeInTheDocument();
  });
});
