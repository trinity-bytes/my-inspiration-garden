import type { Item } from "@garden/shared";
import { CircleAlert, History, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type ItemRevision,
  listItemRevisions as listItemRevisionsDefault,
  restoreItemRevision as restoreItemRevisionDefault,
} from "../api/endpoints";
import { Button } from "../components/Button/Button";
import { DialogHeader } from "../components/Dialog/DialogHeader";
import { useDialogFocusTrap } from "../components/Dialog/useDialogFocusTrap";
import "./FormModal.css";

export interface RevisionHistoryModalProps {
  item: Item;
  onClose: () => void;
  /** Called after a successful restore, so the caller can refetch the canvas (T11). */
  onRestored: () => void;
  listItemRevisions?: (id: string) => Promise<{ revisions: ItemRevision[] }>;
  restoreItemRevision?: (id: string, revisionId: string) => Promise<Item>;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/** Owner-only revision history + restore dialog (T11). */
export function RevisionHistoryModal({
  item,
  onClose,
  onRestored,
  listItemRevisions = listItemRevisionsDefault,
  restoreItemRevision = restoreItemRevisionDefault,
}: RevisionHistoryModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const { handleTabKey } = useDialogFocusTrap(dialogRef, onClose);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [revisions, setRevisions] = useState<ItemRevision[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = "revision-history-modal-title";

  useEffect(() => {
    let cancelled = false;
    listItemRevisions(item.id)
      .then((result) => {
        if (cancelled) return;
        setRevisions(result.revisions);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, listItemRevisions]);

  async function handleRestore(revisionId: string): Promise<void> {
    setRestoringId(revisionId);
    setError(null);
    try {
      await restoreItemRevision(item.id, revisionId);
      onRestored();
      onClose();
    } catch {
      setError("Could not restore this revision.");
      setRestoringId(null);
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only backdrop close, Escape is the keyboard equivalent (see ItemDetailModal precedent).
    // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
    <div
      className="form-modal-backdrop sheet-backdrop"
      data-testid="revision-history-backdrop"
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
        <DialogHeader titleId={titleId} title="Revision history" onClose={onClose} />

        {error && (
          <p className="dialog-error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {error}
          </p>
        )}

        {status === "loading" && <p className="dialog-empty__hint">Loading revisions…</p>}
        {status === "error" && (
          <p className="dialog-error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            Could not load revision history.
          </p>
        )}
        {status === "ready" && revisions.length === 0 && (
          <div className="dialog-empty">
            <span className="dialog-empty__icon">
              <History size={20} aria-hidden="true" />
            </span>
            <p>No revisions yet.</p>
          </div>
        )}
        {status === "ready" && revisions.length > 0 && (
          <ul className="dialog-list">
            {revisions.map((revision) => (
              <li key={revision.id} className="dialog-row">
                <History size={20} aria-hidden="true" />
                <span className="dialog-row__meta">
                  <span className="dialog-row__title">
                    {revision.snapshot.title?.trim() || revision.snapshot.kind}
                  </span>
                  <span className="dialog-row__sub">
                    {formatTimestamp(revision.createdAt)} — {revision.actor}
                  </span>
                </span>
                <Button
                  size="sm"
                  icon={RotateCcw}
                  onClick={() => handleRestore(revision.id)}
                  disabled={restoringId !== null}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
