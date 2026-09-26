import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDialogFocusTrap } from "../../../src/components/Dialog/useDialogFocusTrap";

function TestDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { handleTabKey } = useDialogFocusTrap(dialogRef, onClose);
  return (
    <div>
      <button type="button">outside</button>
      <div ref={dialogRef} role="dialog" onKeyDown={handleTabKey}>
        <button type="button">first</button>
        <button type="button">last</button>
      </div>
    </div>
  );
}

describe("useDialogFocusTrap", () => {
  it("focuses the first focusable element inside the dialog on mount", () => {
    render(<TestDialog onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps Tab from the last element to the first, and Shift+Tab from the first to the last", () => {
    render(<TestDialog onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("restores focus to the previously focused element on unmount", () => {
    const outsideButton = document.createElement("button");
    outsideButton.textContent = "pre-existing";
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    const { unmount } = render(<TestDialog onClose={vi.fn()} />);
    unmount();

    expect(outsideButton).toHaveFocus();
    outsideButton.remove();
  });
});
