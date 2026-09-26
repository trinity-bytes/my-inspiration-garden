import type { Category } from "@garden/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CategoryManagerModal } from "../../src/categories/CategoryManagerModal";

function baseCategories(): Category[] {
  return [
    { id: "root", name: "Root", slug: "root", parentId: null, position: 0 },
    { id: "child", name: "Child", slug: "child", parentId: "root", position: 0 },
    { id: "other", name: "Other", slug: "other", parentId: null, position: 1 },
  ];
}

describe("CategoryManagerModal (T11b B6)", () => {
  it("renders the full tree, nesting each child under its parent", () => {
    render(
      <CategoryManagerModal
        categories={baseCategories()}
        onClose={vi.fn()}
        createCategory={vi.fn()}
        updateCategory={vi.fn()}
        deleteCategory={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Categories" })).toBeInTheDocument();
    const root = screen.getByText("Root", { selector: ".category-manager__name" }).closest("li");
    expect(root).not.toBeNull();
    expect(
      root &&
        screen.getByText("Child", { selector: ".category-manager__name" }).closest("ul")
          ?.parentElement,
    ).toBe(root);
    expect(screen.getByText("Other", { selector: ".category-manager__name" })).toBeInTheDocument();
  });

  it("renames a category via the inline rename form", async () => {
    const updateCategory = vi.fn().mockResolvedValue(baseCategories()[0]);
    render(
      <CategoryManagerModal
        categories={baseCategories()}
        onClose={vi.fn()}
        createCategory={vi.fn()}
        updateCategory={updateCategory}
        deleteCategory={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rename Root" }));
    const input = screen.getByLabelText("Rename Root");
    fireEvent.change(input, { target: { value: "Renamed Root" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith("root", { name: "Renamed Root" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Rename Root" })).not.toBeInTheDocument(),
    );
  });

  it("adds a child category under a node", async () => {
    const createCategory = vi.fn().mockResolvedValue(baseCategories()[1]);
    render(
      <CategoryManagerModal
        categories={baseCategories()}
        onClose={vi.fn()}
        createCategory={createCategory}
        updateCategory={vi.fn()}
        deleteCategory={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add child of Other" }));
    fireEvent.change(screen.getByLabelText("New subcategory of Other"), {
      target: { value: "Grandchild" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(createCategory).toHaveBeenCalledWith({ name: "Grandchild", parentId: "other" }),
    );
  });

  it("adds a new top-level category", async () => {
    const createCategory = vi.fn().mockResolvedValue(baseCategories()[2]);
    render(
      <CategoryManagerModal
        categories={baseCategories()}
        onClose={vi.fn()}
        createCategory={createCategory}
        updateCategory={vi.fn()}
        deleteCategory={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("New top-level category"), {
      target: { value: "Brand new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add top-level category" }));

    await waitFor(() =>
      expect(createCategory).toHaveBeenCalledWith({ name: "Brand new", parentId: null }),
    );
  });

  it("moves a category to a new parent via the move select, excluding itself and its descendants", async () => {
    const updateCategory = vi.fn().mockResolvedValue(baseCategories()[2]);
    render(
      <CategoryManagerModal
        categories={baseCategories()}
        onClose={vi.fn()}
        createCategory={vi.fn()}
        updateCategory={updateCategory}
        deleteCategory={vi.fn()}
      />,
    );

    const rootMoveSelect = screen.getByLabelText("Move Root") as HTMLSelectElement;
    const optionLabels = Array.from(rootMoveSelect.options).map((option) => option.textContent);
    expect(optionLabels).toContain("Top level");
    expect(optionLabels).toContain("Other");
    expect(optionLabels).not.toContain("Root");
    expect(optionLabels).not.toContain("Child");

    fireEvent.change(screen.getByLabelText("Move Other"), { target: { value: "root" } });

    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith("other", { parentId: "root" }));
  });

  it("moves a category to top level when 'Top level' is selected", async () => {
    const updateCategory = vi.fn().mockResolvedValue(baseCategories()[1]);
    render(
      <CategoryManagerModal
        categories={baseCategories()}
        onClose={vi.fn()}
        createCategory={vi.fn()}
        updateCategory={updateCategory}
        deleteCategory={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Move Child"), { target: { value: "" } });

    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith("child", { parentId: null }));
  });

  it("deletes a category after confirming, and does nothing on cancel", async () => {
    const deleteCategory = vi.fn().mockResolvedValue(undefined);
    render(
      <CategoryManagerModal
        categories={baseCategories()}
        onClose={vi.fn()}
        createCategory={vi.fn()}
        updateCategory={vi.fn()}
        deleteCategory={deleteCategory}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Other" }));
    expect(
      screen.getByText(/subcategories move up one level/i, { selector: "p" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteCategory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete Other" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith("other"));
  });

  it("shows the API's error message inline when a mutation fails", async () => {
    const updateCategory = vi.fn().mockRejectedValue(new Error("nope"));
    render(
      <CategoryManagerModal
        categories={baseCategories()}
        onClose={vi.fn()}
        createCategory={vi.fn()}
        updateCategory={updateCategory}
        deleteCategory={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Move Other"), { target: { value: "root" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
  });
});
