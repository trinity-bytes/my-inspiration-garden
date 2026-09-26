import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Navbar } from "../../src/components/Navbar/Navbar";
import { defaultFilterState } from "../../src/filters/filter-state";

describe("Navbar", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // `mockImplementation`, not `mockResolvedValue`: `Navbar` fetches its
    // filter options via two concurrent calls (`getCategoryTree`,
    // `getTags`), and a `Response` body can only be read once — a single
    // shared instance would make the second reader's `.json()` throw.
    globalThis.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { code: "forbidden", message: "no" } }), {
          status: 403,
        }),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("renders the brand wordmark", () => {
    render(<Navbar />);
    expect(screen.getByRole("heading", { name: "Inspiration Garden" })).toBeInTheDocument();
  });

  it("focuses the search input on Ctrl+K", () => {
    render(<Navbar />);
    const search = screen.getByLabelText("Search the garden");
    expect(search).not.toHaveFocus();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
    );

    expect(search).toHaveFocus();
  });

  it("toggles the filters button's aria-expanded state on click", () => {
    render(<Navbar />);

    const filtersButton = screen.getByRole("button", { name: "Filters" });
    expect(filtersButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(filtersButton);
    expect(filtersButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(filtersButton);
    expect(filtersButton).toHaveAttribute("aria-expanded", "false");
  });

  it("does not show a sign-out link by default (not the owner)", () => {
    render(<Navbar />);
    expect(screen.queryByRole("link", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows a sign-out link to the Access logout route when the owner", () => {
    render(<Navbar isOwner />);
    const signOut = screen.getByRole("link", { name: "Sign out" });
    expect(signOut).toHaveAttribute("href", "/cdn-cgi/access/logout");
  });

  it("does not render the filter panel while closed", () => {
    render(<Navbar />);
    expect(screen.queryByRole("region", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("opens the filter panel when the Filters button is clicked", () => {
    render(<Navbar />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("region", { name: "Filters" })).toBeInTheDocument();
  });

  it("reports filter-panel open/close through onFilterPanelOpenChange (T10 owner QA: canvas drift must pause while it's open)", () => {
    const onFilterPanelOpenChange = vi.fn();
    render(<Navbar onFilterPanelOpenChange={onFilterPanelOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(onFilterPanelOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(onFilterPanelOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("reports search input changes through onFiltersChange with the rest of the filters preserved", () => {
    const onFiltersChange = vi.fn();
    render(
      <Navbar
        filters={{ ...defaultFilterState(), kinds: ["image"] }}
        onFiltersChange={onFiltersChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search the garden"), {
      target: { value: "sunset" },
    });

    expect(onFiltersChange).toHaveBeenCalledWith({
      ...defaultFilterState(),
      kinds: ["image"],
      q: "sunset",
    });
  });

  it("does not show Add/Trash/Categories buttons for a visitor (T11/T11b, owner-only)", () => {
    render(<Navbar />);
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Trash" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Categories" })).not.toBeInTheDocument();
  });

  it("shows Add/Trash/Categories buttons for the owner and wires their callbacks (T11/T11b)", () => {
    const onAddClick = vi.fn();
    const onTrashClick = vi.fn();
    const onCategoriesClick = vi.fn();
    render(
      <Navbar
        isOwner
        onAddClick={onAddClick}
        onTrashClick={onTrashClick}
        onCategoriesClick={onCategoriesClick}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(onAddClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Trash" }));
    expect(onTrashClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    expect(onCategoriesClick).toHaveBeenCalledTimes(1);
  });
});
