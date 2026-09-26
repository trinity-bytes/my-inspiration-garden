import type { Item } from "@garden/shared";
import { useEffect, useRef, useState } from "react";
import { listItems as listItemsDefault, restoreItem as restoreItemDefault } from "../api/endpoints";
import { useDialogFocusTrap } from "../components/Dialog/useDialogFocusTrap";
import "../forms/FormModal.css";
import "./TrashModal.css";

export interface TrashModalProps {
  onClose: () => void;
  /** Called after a successful restore, so the caller can refetch the canvas (T11). */
  onRestored: () => void;
  listItems?: (params: { deletedOnly: boolean; limit: number }) => Promise<{ items: Item[] }>;
  restoreItem?: (id: string) => Promise<Item>;
}

/** Owner-only trash dialog (T11): lists soft-deleted items and restores them. */
export function TrashModal({
  onClose,
  onRestored,
  listItems = listItemsDefault,
  restoreItem = restoreItemDefault,
}: TrashModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { handleTabKey } = useDialogFocusTrap(dialogRef, onClose);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [items, setItems] = useState<Item[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = "trash-modal-title";

  useEffect(() => {
    let cancelled = false;
    listItems({ deletedOnly: true, limit: 100 })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [listItems]);

  async function handleRestore(id: string): Promise<void> {
    setRestoringId(id);
    setError(null);
    try {
      await restoreItem(id);
      setItems((current) => current.filter((item) => item.id !== id));
      onRestored();
    } catch {
      setError("Could not restore this item.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only backdrop close, Escape is the keyboard equivalent (see ItemDetailModal precedent).
    // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
    <div className="form-modal-backdrop" data-testid="trash-backdrop" onClick={onClose}>
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
          Trash
        </h2>

        {error && (
          <p className="item-form__error" role="alert">
            {error}
          </p>
        )}

        {status === "loading" && <p>Loading trash…</p>}
        {status === "error" && <p role="alert">Could not load trash.</p>}
        {status === "ready" && items.length === 0 && <p>The trash is empty.</p>}
        {status === "ready" && items.length > 0 && (
          <ul className="trash__list">
            {items.map((item) => (
              <li key={item.id} className="trash__item">
                <span className="trash__title">{item.title?.trim() || item.kind}</span>
                <button
                  type="button"
                  onClick={() => handleRestore(item.id)}
                  disabled={restoringId !== null}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="item-form__actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
