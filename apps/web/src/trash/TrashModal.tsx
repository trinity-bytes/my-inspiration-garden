import type { Item } from "@garden/shared";
import { CircleAlert, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { listItems as listItemsDefault, restoreItem as restoreItemDefault } from "../api/endpoints";
import { Button } from "../components/Button/Button";
import { DialogHeader } from "../components/Dialog/DialogHeader";
import { useDialogFocusTrap } from "../components/Dialog/useDialogFocusTrap";
import { KIND_ICONS, KIND_LABELS } from "../items/kind-icons";
import "../forms/FormModal.css";

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
    <div
      className="form-modal-backdrop sheet-backdrop"
      data-testid="trash-backdrop"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="glass form-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleTabKey}
      >
        <DialogHeader titleId={titleId} title="Trash" onClose={onClose} />

        {error && (
          <p className="dialog-error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {error}
          </p>
        )}

        {status === "loading" && <p className="dialog-empty__hint">Loading trash…</p>}
        {status === "error" && (
          <p className="dialog-error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            Could not load trash.
          </p>
        )}
        {status === "ready" && items.length === 0 && (
          <div className="dialog-empty">
            <span className="dialog-empty__icon">
              <Trash2 size={20} aria-hidden="true" />
            </span>
            <p>The trash is empty.</p>
            <p className="dialog-empty__hint">Items you move to the trash show up here.</p>
          </div>
        )}
        {status === "ready" && items.length > 0 && (
          <ul className="dialog-list">
            {items.map((item) => {
              const KindIcon = KIND_ICONS[item.kind];
              return (
                <li key={item.id} className="dialog-row">
                  <span className="dialog-row__tile">
                    <KindIcon size={16} aria-hidden="true" />
                  </span>
                  <span className="dialog-row__meta">
                    <span className="dialog-row__title">
                      {item.title?.trim() || KIND_LABELS[item.kind]}
                    </span>
                    <span className="dialog-row__sub">{KIND_LABELS[item.kind]}</span>
                  </span>
                  <Button
                    size="sm"
                    icon={RotateCcw}
                    onClick={() => handleRestore(item.id)}
                    disabled={restoringId !== null}
                  >
                    Restore
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
