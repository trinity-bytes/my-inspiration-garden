import { fireEvent, render, screen } from "@testing-library/react";
import { Pencil } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "../../src/components/IconButton/IconButton";

describe("IconButton", () => {
  it("is named by its label and shows the same label as a tooltip", () => {
    render(<IconButton icon={Pencil} label="Edit" />);

    const button = screen.getByRole("button", { name: "Edit" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    // The tooltip repeats the accessible name visually, so it stays hidden
    // from assistive technology instead of being announced twice.
    const tooltip = screen.getByText("Edit");
    expect(tooltip).toHaveClass("tooltip");
    expect(tooltip).toHaveAttribute("aria-hidden", "true");
  });

  it("defaults to the neutral tone and accepts accent and danger", () => {
    const { rerender } = render(<IconButton icon={Pencil} label="Edit" />);
    expect(screen.getByRole("button")).toHaveClass("icon-button", "icon-button--neutral");

    rerender(<IconButton icon={Pencil} label="Edit" tone="danger" />);
    expect(screen.getByRole("button")).toHaveClass("icon-button--danger");
  });

  it("forwards clicks and native button attributes", () => {
    const onClick = vi.fn();
    render(<IconButton icon={Pencil} label="Edit" onClick={onClick} aria-expanded={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("can hide the tooltip when a visible label already names the control", () => {
    render(<IconButton icon={Pencil} label="Edit" tooltip={false} />);
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });
});
