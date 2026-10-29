import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterPanel } from "../../src/filters/FilterPanel";
import { defaultFilterState } from "../../src/filters/filter-state";

const categories = [
  { id: "c1", name: "Illustration", slug: "illustration", parentId: null, position: 0 },
  { id: "c2", name: "Typography", slug: "typography", parentId: "c1", position: 0 },
];
const tags = [
  { id: "t1", name: "ui", count: 3 },
  { id: "t2", name: "warm", count: 1 },
];

describe("FilterPanel", () => {
  it("is hidden when closed", () => {
    render(
      <FilterPanel
        isOpen={false}
        filters={defaultFilterState()}
        onChange={vi.fn()}
        categories={categories}
        tags={tags}
      />,
    );
    expect(screen.queryByRole("region", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("renders a checkbox per item kind and toggles it via onChange", () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        isOpen
        filters={defaultFilterState()}
        onChange={onChange}
        categories={categories}
        tags={tags}
      />,
    );

    const imageChip = screen.getByRole("button", { name: "Image" });
    expect(imageChip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(imageChip);

    expect(onChange).toHaveBeenCalledWith({ ...defaultFilterState(), kinds: ["image"] });
  });

  it("renders the category tree with nested children and toggles a categoryId", () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        isOpen
        filters={defaultFilterState()}
        onChange={onChange}
        categories={categories}
        tags={tags}
      />,
    );

    const parentCheckbox = screen.getByRole("checkbox", { name: "Illustration" });
    const childCheckbox = screen.getByRole("checkbox", { name: "Typography" });
    expect(parentCheckbox).toBeInTheDocument();
    expect(childCheckbox).toBeInTheDocument();

    fireEvent.click(parentCheckbox);
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilterState(), categoryIds: ["c1"] });
  });

  it("shows a parent with only a selected child as mixed, without changing what clicking does", () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        isOpen
        filters={{ ...defaultFilterState(), categoryIds: ["c2"] }}
        onChange={onChange}
        categories={categories}
        tags={tags}
      />,
    );

    const parentCheckbox = screen.getByRole("checkbox", { name: "Illustration" });
    expect(parentCheckbox).toHaveAttribute("aria-checked", "mixed");
    expect((parentCheckbox as HTMLInputElement).indeterminate).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Typography" })).toBeChecked();

    fireEvent.click(parentCheckbox);
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilterState(), categoryIds: ["c2", "c1"] });
  });

  it("renders every tag with its count and toggles it", () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        isOpen
        filters={defaultFilterState()}
        onChange={onChange}
        categories={categories}
        tags={tags}
      />,
    );

    const tagButton = screen.getByRole("button", { name: "ui (3)" });
    fireEvent.click(tagButton);
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilterState(), tags: ["ui"] });
  });

  it("marks a selected tag as pressed", () => {
    render(
      <FilterPanel
        isOpen
        filters={{ ...defaultFilterState(), tags: ["ui"] }}
        onChange={vi.fn()}
        categories={categories}
        tags={tags}
      />,
    );
    expect(screen.getByRole("button", { name: "ui (3)" })).toHaveAttribute("aria-pressed", "true");
  });

  it("selects a preset color swatch", () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        isOpen
        filters={defaultFilterState()}
        onChange={onChange}
        categories={categories}
        tags={tags}
      />,
    );

    const swatch = screen.getByRole("button", { name: "Filter by color apricot" });
    fireEvent.click(swatch);
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilterState(), color: "#F29A6B" });
  });

  it("clears the color filter when the active swatch is clicked again", () => {
    const onChange = vi.fn();
    render(
      <FilterPanel
        isOpen
        filters={{ ...defaultFilterState(), color: "#F29A6B" }}
        onChange={onChange}
        categories={categories}
        tags={tags}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter by color apricot" }));
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilterState(), color: undefined });
  });

  it("shows a clear-all button only when a filter is active, and it resets every facet", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FilterPanel
        isOpen
        filters={defaultFilterState()}
        onChange={onChange}
        categories={categories}
        tags={tags}
      />,
    );
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    rerender(
      <FilterPanel
        isOpen
        filters={{ ...defaultFilterState(), kinds: ["image"] }}
        onChange={onChange}
        categories={categories}
        tags={tags}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onChange).toHaveBeenCalledWith(defaultFilterState());
  });
});
