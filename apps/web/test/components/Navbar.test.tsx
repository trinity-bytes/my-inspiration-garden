import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Navbar } from "../../src/components/Navbar/Navbar";

describe("Navbar", () => {
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
});
