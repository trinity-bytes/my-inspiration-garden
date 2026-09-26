import type { Item } from "@garden/shared";
import { useEffect, useRef, useState } from "react";
import {
  type ItemRevision,
  listItemRevisions as listItemRevisionsDefault,
  restoreItemRevision as restoreItemRevisionDefault,
} from "../api/endpoints";
import { useDialogFocusTrap } from "../components/Dialog/useDialogFocusTrap";
import "./FormModal.css";
import "./RevisionHistoryModal.css";

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
    return new Date(iso).toLocaleString();
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
    <div className="form-modal-backdrop" data-testid="revision-history-backdrop" onClick={onClose}>
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
          Revision history
        </h2>

        {error && (
          <p className="item-form__error" role="alert">
            {error}
          </p>
        )}

        {status === "loading" && <p>Loading revisions…</p>}
        {status === "error" && <p role="alert">Could not load revision history.</p>}
        {status === "ready" && revisions.length === 0 && <p>No revisions yet.</p>}
        {status === "ready" && revisions.length > 0 && (
          <ul className="revision-history__list">
            {revisions.map((revision) => (
              <li key={revision.id} className="revision-history__item">
                <div className="revision-history__meta">
                  <span className="revision-history__title">
                    {revision.snapshot.title?.trim() || revision.snapshot.kind}
                  </span>
                  <span className="revision-history__timestamp">
                    {formatTimestamp(revision.createdAt)} — {revision.actor}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(revision.id)}
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
