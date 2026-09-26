import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/errors";
import { QuickAddModal } from "../../src/forms/QuickAddModal";

const categories = [
  { id: "c1", name: "Illustration", slug: "illustration", parentId: null, position: 0 },
];

describe("QuickAddModal", () => {
  it("renders as a labelled dialog and creates a text item on submit", async () => {
    const createItem = vi.fn().mockResolvedValue({ id: "new-item" });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(
      <QuickAddModal
        categories={categories}
        onClose={onClose}
        onCreated={onCreated}
        createItem={createItem}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Add item" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "hello garden" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0]?.[0]).toMatchObject({
      kind: "text",
      data: { body: "hello garden" },
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an api error and keeps the modal open when the create request fails", async () => {
    const createItem = vi.fn().mockRejectedValue(new ApiError("failed", { kind: "network" }));
    const onClose = vi.fn();
    render(
      <QuickAddModal
        categories={categories}
        onClose={onClose}
        onCreated={vi.fn()}
        createItem={createItem}
      />,
    );

    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "hello garden" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes via Escape without saving", () => {
    const onClose = vi.fn();
    render(<QuickAddModal categories={categories} onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
