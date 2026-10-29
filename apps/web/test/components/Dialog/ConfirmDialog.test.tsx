import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../../../src/components/Dialog/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders as a labelled dialog with the given title and message", () => {
    render(
      <ConfirmDialog
        title="Move to trash?"
        message="This item will be moved to the trash."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Move to trash?");
    expect(screen.getByText("This item will be moved to the trash.")).toBeInTheDocument();
  });

  it("uses default Confirm/Cancel labels when none are given", () => {
    render(
      <ConfirmDialog
        title="Are you sure?"
        message="Confirm this."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses custom confirm/cancel labels when given", () => {
    render(
      <ConfirmDialog
        title="Move to trash?"
        message="This item will be moved to the trash."
        confirmLabel="Move to trash"
        cancelLabel="Keep it"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Move to trash" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Are you sure?"
        message="Confirm this."
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Are you sure?"
        message="Confirm this."
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on Escape", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Are you sure?"
        message="Confirm this."
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("marks the confirm button as destructive when requested", () => {
    render(
      <ConfirmDialog
        title="Are you sure?"
        message="Confirm this."
        destructive
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toHaveClass("button--danger");
    expect(confirm.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".confirm-dialog__icon svg")).not.toBeNull();
  });

  it("uses the accent button and no danger icon when not destructive", () => {
    render(
      <ConfirmDialog
        title="Are you sure?"
        message="Confirm this."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Confirm" })).toHaveClass("button--accent");
    expect(document.querySelector(".confirm-dialog__icon")).toBeNull();
  });

  it("starts focus on the Cancel button", () => {
    render(
      <ConfirmDialog
        title="Are you sure?"
        message="Confirm this."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });
});
