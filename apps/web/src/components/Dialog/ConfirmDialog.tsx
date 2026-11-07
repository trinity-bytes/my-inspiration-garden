import { type LucideIcon, Trash2 } from "lucide-react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "../Button/Button";
import { useDialogFocusTrap } from "./useDialogFocusTrap";
import "../../forms/FormModal.css";
import "./ConfirmDialog.css";

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action (e.g. move to trash). */
  destructive?: boolean;
  /** Icon shown in the danger tile and on the confirm button of a destructive dialog. */
  icon?: LucideIcon;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small reusable confirmation dialog (Modals v2 "Confirm ·
 * destructive", Figma `33:1185`: a danger icon tile shows the risk before
 * the text is read), used before an owner-only
 * destructive action such as "Move to trash". Reuses the shared modal
 * pattern (`form-modal-backdrop`/`form-modal-dialog` + `useDialogFocusTrap`)
 * so it gets the same Escape-to-cancel, Tab trap, and focus-return behavior
 * as every other owner dialog. The Cancel button is rendered first so the
 * shared focus trap's "focus the first focusable element" behavior lands
 * on Cancel, not the destructive Confirm action.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  icon: Icon = Trash2,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { handleTabKey } = useDialogFocusTrap(dialogRef, onCancel);
  const titleId = "confirm-dialog-title";

  // Portaled to <body>: opened from inside another glass dialog, whose
  // `backdrop-filter` would otherwise become the containing block of this
  // fixed backdrop and trap it inside that dialog's box.
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only backdrop close, Escape is the keyboard equivalent (see ItemDetailModal precedent).
    // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
    <div
      className="form-modal-backdrop sheet-backdrop"
      data-testid="confirm-dialog-backdrop"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="glass form-modal-dialog confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleTabKey}
      >
        {destructive && (
          <span className="confirm-dialog__icon">
            <Icon size={20} aria-hidden="true" />
          </span>
        )}
        <h2 id={titleId} className="form-modal__title">
          {title}
        </h2>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <Button onClick={onCancel}>{cancelLabel}</Button>
          <Button
            variant={destructive ? "danger" : "accent"}
            icon={destructive ? Icon : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
