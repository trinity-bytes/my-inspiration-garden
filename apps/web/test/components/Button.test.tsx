import { fireEvent, render, screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../src/components/Button/Button";

describe("Button", () => {
  it("defaults to a secondary MD button of type button", () => {
    render(<Button>Cancel</Button>);

    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("button", "button--secondary", "button--md");
    expect(button.querySelector("svg")).toBeNull();
  });

  it("renders a decorative leading icon and keeps the text as its name", () => {
    render(
      <Button variant="accent" size="sm" icon={Plus}>
        Add
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Add" });
    expect(button).toHaveClass("button--accent", "button--sm");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("forwards type, disabled and clicks", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button type="submit" onClick={onClick}>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");

    rerender(
      <Button type="submit" disabled>
        Save
      </Button>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
