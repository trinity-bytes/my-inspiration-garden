import { useRef } from "react";
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
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small reusable confirmation dialog (T11b B2), used before an owner-only
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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { handleTabKey } = useDialogFocusTrap(dialogRef, onCancel);
  const titleId = "confirm-dialog-title";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only backdrop close, Escape is the keyboard equivalent (see ItemDetailModal precedent).
    // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
    <div className="form-modal-backdrop" data-testid="confirm-dialog-backdrop" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="form-modal-dialog confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleTabKey}
      >
        <h2 id={titleId} className="form-modal__title">
          {title}
        </h2>
        <p className="confirm-dialog__message">{message}</p>
        <div className="item-form__actions">
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              destructive
                ? "confirm-dialog__confirm confirm-dialog__confirm--destructive"
                : "confirm-dialog__confirm"
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
