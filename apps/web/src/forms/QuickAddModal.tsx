import type { Category } from "@garden/shared";
import { useRef, useState } from "react";
import { createItem as createItemDefault } from "../api/endpoints";
import { ApiError } from "../api/errors";
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

/** Owner-only quick-add dialog (T11): a frosted-glass modal wrapping `ItemForm`. */
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
    <div className="form-modal-backdrop" data-testid="quick-add-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="form-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleTabKey}
      >
        <h2 id={titleId} className="form-modal__title">
          Add item
        </h2>
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
