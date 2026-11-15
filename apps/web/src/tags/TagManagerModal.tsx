import { normalizeTag } from "@garden/shared";
import { Check, CircleAlert, Hash, Pencil, Search, Tag, Trash2, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import {
  deleteTag as deleteTagDefault,
  getTags as getTagsDefault,
  renameTag as renameTagDefault,
  type TagsResult,
  type TagWithCountResult,
} from "../api/endpoints";
import { Button } from "../components/Button/Button";
import { ConfirmDialog } from "../components/Dialog/ConfirmDialog";
import { DialogHeader } from "../components/Dialog/DialogHeader";
import { useDialogFocusTrap } from "../components/Dialog/useDialogFocusTrap";
import { IconButton } from "../components/IconButton/IconButton";
import { matchTags, sortTags, type TagSort, type TagWithCount } from "../filters/tag-list";
import { invalidateTags } from "./tags-store";
import "../forms/FormModal.css";
import "../categories/CategoryManagerModal.css";
import "./TagManagerModal.css";

/** A tag was renamed (`to` is its final name, possibly a merge target) or deleted (`to` is null). */
export interface TagChange {
  from: string;
  to: string | null;
}

export interface TagManagerModalProps {
  onClose: () => void;
  /** Lets the app keep active tag filters in step; called once per action with every change it made. */
  onTagsChange?: (changes: TagChange[]) => void;
  getTags?: () => Promise<TagsResult>;
  renameTag?: (id: string, name: string) => Promise<TagWithCountResult>;
  deleteTag?: (id: string) => Promise<void>;
}

type PendingDelete = { kind: "one"; tag: TagWithCount } | { kind: "unused" };

const MUTATION_ERROR = "That tag action failed. Please try again.";
const LOAD_ERROR = "Tags couldn’t load. Please try again.";

const SORT_OPTIONS: { value: TagSort; label: string }[] = [
  { value: "count", label: "Most used" },
  { value: "name", label: "A–Z" },
];

function itemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

/** “a”, “a” and “b”, or “a”, “b” and 3 more. */
function quotedList(names: string[]): string {
  const quoted = names.map((name) => `“${name}”`);
  if (quoted.length <= 2) return quoted.join(" and ");
  if (quoted.length === 3) return `${quoted[0]}, ${quoted[1]} and ${quoted[2]}`;
  return `${quoted[0]}, ${quoted[1]} and ${quoted.length - 2} more`;
}

/**
 * Owner-only tag manager (Figma "Proposal · Tags"), opened from the account
 * menu or the filter panel's "Manage tags". Lists every tag with its item
 * count, sortable and searchable, with per-tag rename (the server merges into
 * an existing tag of the same name) and delete, plus one action that deletes
 * every tag no item uses. Each successful change reloads the list, bumps the
 * shared tags version so the filter panel refetches, and reports the change.
 */
export function TagManagerModal({
  onClose,
  onTagsChange,
  getTags = getTagsDefault,
  renameTag = renameTagDefault,
  deleteTag = deleteTagDefault,
}: TagManagerModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  // While the nested ConfirmDialog is open it owns Escape and the Tab trap.
  const { handleTabKey } = useDialogFocusTrap(dialogRef, () => {
    if (pendingDelete === null) onClose();
  });
  const titleId = "tag-manager-title";
  const searchId = useId();
  const [tags, setTags] = useState<TagWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<TagSort>("count");
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await getTags();
    setTags(result.tags);
  }, [getTags]);

  useEffect(() => {
    reload().catch(() => setError(LOAD_ERROR));
  }, [reload]);

  async function runMutation(action: () => Promise<TagChange[]>): Promise<boolean> {
    setError(null);
    try {
      const changes = await action();
      invalidateTags();
      onTagsChange?.(changes);
      await reload();
      return true;
    } catch {
      setError(MUTATION_ERROR);
      return false;
    }
  }

  const allTags = tags ?? [];
  const visible = matchTags(sortTags(allTags, sort), query);
  // Sorted by name so the confirm message reads the same on every load.
  const unused = sortTags(
    allTags.filter((tag) => tag.count === 0),
    "name",
  );

  function confirmDelete(): void {
    const pending = pendingDelete;
    if (!pending) return;
    const targets = pending.kind === "one" ? [pending.tag] : unused;
    void runMutation(async () => {
      const changes: TagChange[] = [];
      for (const tag of targets) {
        await deleteTag(tag.id);
        changes.push({ from: tag.name, to: null });
      }
      return changes;
    }).then(() => setPendingDelete(null));
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only backdrop close, Escape is the keyboard equivalent (see ItemDetailModal precedent).
    // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
    <div
      className="form-modal-backdrop sheet-backdrop"
      data-testid="tag-manager-backdrop"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="glass form-modal-dialog sheet--full tag-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={pendingDelete === null ? handleTabKey : undefined}
      >
        <DialogHeader titleId={titleId} title="Tags" onClose={onClose} />

        {error && (
          <p className="dialog-error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {error}
          </p>
        )}

        {tags !== null && tags.length === 0 && (
          <div className="dialog-empty">
            <span className="dialog-empty__icon">
              <Tag size={20} aria-hidden="true" />
            </span>
            <p>No tags yet.</p>
          </div>
        )}

        {allTags.length > 0 && (
          <>
            <div className="tag-manager__toolbar">
              <label className="visually-hidden" htmlFor={searchId}>
                Search tags
              </label>
              <span className="control-with-icon category-manager__grow">
                <Search size={16} aria-hidden="true" />
                <input
                  id={searchId}
                  type="search"
                  placeholder={`Search ${allTags.length} tags`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </span>
              {/* biome-ignore lint/a11y/useSemanticElements: a pair of toggle buttons, not a form fieldset. */}
              <div role="group" aria-label="Sort tags" className="tag-manager__sort">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="chip chip--toggle"
                    aria-pressed={sort === option.value}
                    onClick={() => setSort(option.value)}
                  >
                    {sort === option.value && <Check size={14} aria-hidden="true" />}
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <ul className="tag-manager__list">
              {visible.map((tag) => (
                <TagRow
                  key={tag.id}
                  tag={tag}
                  allTags={allTags}
                  isRenaming={renamingId === tag.id}
                  onRenameStart={() => setRenamingId(tag.id)}
                  onRenameEnd={() => setRenamingId(null)}
                  onRename={(name) =>
                    runMutation(async () => {
                      const result = await renameTag(tag.id, name);
                      return [{ from: tag.name, to: result.name }];
                    })
                  }
                  onDeleteRequest={() => setPendingDelete({ kind: "one", tag })}
                />
              ))}
            </ul>
            {visible.length === 0 && (
              <p className="tag-manager__no-match">No tags match “{query.trim()}”.</p>
            )}

            {unused.length > 0 && (
              <div className="tag-manager__cleanup">
                <span className="tag-manager__muted">
                  {unused.length === 1
                    ? "1 tag isn’t on any item."
                    : `${unused.length} tags aren’t on any item.`}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  onClick={() => setPendingDelete({ kind: "unused" })}
                >
                  Delete unused
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {pendingDelete?.kind === "one" && (
        <ConfirmDialog
          title={`Delete “${pendingDelete.tag.name}”?`}
          message={
            pendingDelete.tag.count === 0
              ? "It isn’t on any item. This can’t be undone."
              : `It will be removed from ${itemCount(pendingDelete.tag.count)}. The items stay in the garden.`
          }
          confirmLabel="Delete tag"
          destructive
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
      {pendingDelete?.kind === "unused" && (
        <ConfirmDialog
          title={
            unused.length === 1 ? "Delete 1 unused tag?" : `Delete ${unused.length} unused tags?`
          }
          message={`${quotedList(unused.map((tag) => tag.name))} ${
            unused.length === 1 ? "isn’t" : "aren’t"
          } on any item. This can’t be undone.`}
          confirmLabel={unused.length === 1 ? "Delete 1 tag" : `Delete ${unused.length} tags`}
          destructive
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

interface TagRowProps {
  tag: TagWithCount;
  allTags: TagWithCount[];
  isRenaming: boolean;
  onRenameStart: () => void;
  onRenameEnd: () => void;
  onRename: (name: string) => Promise<boolean>;
  onDeleteRequest: () => void;
}

function TagRow({
  tag,
  allTags,
  isRenaming,
  onRenameStart,
  onRenameEnd,
  onRename,
  onDeleteRequest,
}: TagRowProps) {
  const renameInputId = useId();
  const hintId = useId();
  const [value, setValue] = useState(tag.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // The rename field replaces the focused Rename button, so focus moves into it.
  useEffect(() => {
    if (isRenaming) {
      setValue(tag.name);
      inputRef.current?.focus();
    }
  }, [isRenaming, tag.name]);

  const normalized = normalizeTag(value);
  const mergeTarget =
    normalized !== tag.name ? allTags.find((other) => other.name === normalized) : undefined;

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const name = value.trim();
    if (!name || normalizeTag(name) === tag.name) {
      onRenameEnd();
      return;
    }
    void onRename(name).then((ok) => {
      if (ok) onRenameEnd();
    });
  }

  return (
    <li className="tag-manager__item">
      <div className="category-manager__row">
        <Hash className="category-manager__folder" size={16} aria-hidden="true" />
        {isRenaming ? (
          <form className="category-manager__inline-form" onSubmit={handleSubmit}>
            <label className="visually-hidden" htmlFor={renameInputId}>
              Rename {tag.name}
            </label>
            <input
              id={renameInputId}
              ref={inputRef}
              className="category-manager__grow"
              value={value}
              aria-describedby={mergeTarget ? hintId : undefined}
              onChange={(event) => setValue(event.target.value)}
            />
            <Button type="submit" variant="accent" size="sm" icon={Check}>
              Save
            </Button>
            <IconButton icon={X} label="Cancel" tooltipAlign="end" onClick={onRenameEnd} />
          </form>
        ) : (
          <>
            <span className="tag-manager__label">
              <span className="tag-manager__name">{tag.name}</span>
              <span className="tag-manager__muted">
                {tag.count === 0 ? "Unused" : itemCount(tag.count)}
              </span>
            </span>
            <span className="category-manager__actions">
              <IconButton icon={Pencil} label={`Rename ${tag.name}`} onClick={onRenameStart} />
              <IconButton
                icon={Trash2}
                label={`Delete ${tag.name}`}
                tone="danger"
                tooltipAlign="end"
                onClick={onDeleteRequest}
              />
            </span>
          </>
        )}
      </div>
      {isRenaming && mergeTarget && (
        <p id={hintId} className="tag-manager__hint">
          A tag named “{mergeTarget.name}” already exists. Saving merges these{" "}
          {itemCount(tag.count)} into it.
        </p>
      )}
    </li>
  );
}
