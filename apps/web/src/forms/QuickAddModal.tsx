import type { Category } from "@garden/shared";
import { useRef, useState } from "react";
import { createItem as createItemDefault } from "../api/endpoints";
import { ApiError } from "../api/errors";
import { DialogHeader } from "../components/Dialog/DialogHeader";
import { useDialogFocusTrap } from "../components/Dialog/useDialogFocusTrap";
import { ItemForm } from "./ItemForm";
import "./FormModal.css";
import { type CreateItemFormInput, createEmptyFormState } from "./item-form-state";

export interface QuickAddModalProps {
  categories: Category[];
  onClose: () => void;
  /** Called after a successful create, so the caller can refetch the canvas (T11). */
  onCreated: () => void;
  createItem?: (input: CreateItemFormInput) => Promise<{ id: string }>;
}

/** Owner-only quick-add dialog (T11): a solid cartoon-style modal wrapping `ItemForm`. */
export function QuickAddModal({
  categories,
  onClose,
  onCreated,
  createItem = createItemDefault,
}: QuickAddModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { handleTabKey } = useDialogFocusTrap(dialogRef, onClose);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const titleId = "quick-add-modal-title";

  async function handleSubmit(input: CreateItemFormInput): Promise<void> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createItem(input);
      onCreated();
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? "Could not add this item — the garden api rejected the request."
          : "Could not add this item.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only backdrop close, Escape is the keyboard equivalent (see ItemDetailModal precedent).
    // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
    <div
      className="form-modal-backdrop sheet-backdrop"
      data-testid="quick-add-backdrop"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="glass form-modal-dialog sheet--full"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleTabKey}
      >
        <DialogHeader titleId={titleId} title="Add item" onClose={onClose} />
        <ItemForm
          mode="create"
          initialState={createEmptyFormState("text")}
          categories={categories}
          onSubmit={handleSubmit}
          onCancel={onClose}
          submitting={submitting}
          submitError={submitError}
        />
      </div>
    </div>
  );
}
