import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/errors";
import { EditItemModal } from "../../src/forms/EditItemModal";

const categories = [
  { id: "c1", name: "Illustration", slug: "illustration", parentId: null, position: 0 },
];

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

describe("EditItemModal", () => {
  it("renders as a labelled dialog prefilled from the item and saves an edit", async () => {
    const updateItem = vi.fn().mockResolvedValue({ ...item, title: "Renamed" });
    const onUpdated = vi.fn();
    const onClose = vi.fn();
    render(
      <EditItemModal
        item={item}
        categories={categories}
        onClose={onClose}
        onUpdated={onUpdated}
        updateItem={updateItem}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Edit item" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Existing");
    // kind is immutable in edit mode
    expect(screen.queryByLabelText("Kind")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    expect(updateItem).toHaveBeenCalledWith(item.id, expect.objectContaining({ title: "Renamed" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an api error and keeps the modal open when the update request fails", async () => {
    const updateItem = vi
      .fn()
      .mockRejectedValue(new ApiError("failed", { kind: "http", status: 500 }));
    const onClose = vi.fn();
    render(
      <EditItemModal
        item={item}
        categories={categories}
        onClose={onClose}
        onUpdated={vi.fn()}
        updateItem={updateItem}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not/i);
    expect(onClose).not.toHaveBeenCalled();
  });
});
