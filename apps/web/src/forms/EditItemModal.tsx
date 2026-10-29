import type { Category, Item, UpdateItemInput } from "@garden/shared";
import { useRef, useState } from "react";
import { updateItem as updateItemDefault } from "../api/endpoints";
import { ApiError } from "../api/errors";
import { DialogHeader } from "../components/Dialog/DialogHeader";
import { useDialogFocusTrap } from "../components/Dialog/useDialogFocusTrap";
import "./FormModal.css";
import { ItemForm } from "./ItemForm";
import { formStateFromItem } from "./item-form-state";

export interface EditItemModalProps {
  item: Item;
  categories: Category[];
  onClose: () => void;
  /** Called after a successful save, so the caller can refetch the canvas (T11). */
  onUpdated: () => void;
  updateItem?: (id: string, input: UpdateItemInput) => Promise<Item>;
}

/** Owner-only edit dialog (T11): a solid cartoon-style modal wrapping `ItemForm` in edit mode. */
export function EditItemModal({
  item,
  categories,
  onClose,
  onUpdated,
  updateItem = updateItemDefault,
}: EditItemModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { handleTabKey } = useDialogFocusTrap(dialogRef, onClose);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const titleId = "edit-item-modal-title";

  async function handleSubmit(input: UpdateItemInput): Promise<void> {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateItem(item.id, input);
      onUpdated();
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? "Could not save this item — the garden api rejected the request."
          : "Could not save this item.",
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
      data-testid="edit-item-backdrop"
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
        <DialogHeader titleId={titleId} title="Edit item" onClose={onClose} />
        <ItemForm
          mode="edit"
          initialState={formStateFromItem(item)}
          categories={categories}
          onSubmit={(input) => handleSubmit(input as UpdateItemInput)}
          onCancel={onClose}
          submitting={submitting}
          submitError={submitError}
        />
      </div>
    </div>
  );
}
