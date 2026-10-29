import type { Category, CreateCategoryInput, UpdateCategoryInput } from "@garden/shared";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Folder,
  FolderInput,
  FolderTree,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  createCategory as createCategoryDefault,
  deleteCategory as deleteCategoryDefault,
  updateCategory as updateCategoryDefault,
} from "../api/endpoints";
import { Button } from "../components/Button/Button";
import { ConfirmDialog } from "../components/Dialog/ConfirmDialog";
import { DialogHeader } from "../components/Dialog/DialogHeader";
import { useDialogFocusTrap } from "../components/Dialog/useDialogFocusTrap";
import { IconButton } from "../components/IconButton/IconButton";
import { buildCategoryTree, type CategoryTreeNode } from "../filters/filter-state";
import { invalidateCategories } from "./categories-store";
import "../forms/FormModal.css";
import "./CategoryManagerModal.css";

export interface CategoryManagerModalProps {
  categories: Category[];
  onClose: () => void;
  createCategory?: (input: CreateCategoryInput) => Promise<Category>;
  updateCategory?: (id: string, input: UpdateCategoryInput) => Promise<Category>;
  deleteCategory?: (id: string) => Promise<void>;
}

const MUTATION_ERROR = "That category action failed. Please try again.";

/** `category.id` plus every descendant's id, used to keep a "move" picker from offering a node's own subtree. */
function selfAndDescendantIds(node: CategoryTreeNode): Set<string> {
  const ids = new Set<string>();
  const walk = (current: CategoryTreeNode): void => {
    ids.add(current.category.id);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return ids;
}

/**
 * Owner-only category manager (T11b B6), opened from the Navbar's owner
 * controls. Shows the full tree (via the same `buildCategoryTree` the
 * filter panel and quick-add/edit forms use) with per-node rename, add
 * child, move, and delete, plus a "new top-level category" action. Every
 * successful mutation calls `invalidateCategories()` so the filter panel,
 * forms, and detail view refetch without a page reload (T11b B6 item 4).
 */
export function CategoryManagerModal({
  categories,
  onClose,
  createCategory = createCategoryDefault,
  updateCategory = updateCategoryDefault,
  deleteCategory = deleteCategoryDefault,
}: CategoryManagerModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // While the nested delete ConfirmDialog is open, this dialog's own
  // Escape-to-close and Tab trap must stand down so only the ConfirmDialog's
  // own `useDialogFocusTrap` instance handles them (same nested-dialog
  // Escape bug as ItemDetailModal's trash confirm, T11b B2).
  const { handleTabKey } = useDialogFocusTrap(dialogRef, () => {
    if (deletingId === null) onClose();
  });
  const titleId = "category-manager-title";
  const newTopLevelInputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [newTopLevelName, setNewTopLevelName] = useState("");

  const tree = buildCategoryTree(categories);
  const deletingCategory = categories.find((category) => category.id === deletingId);

  async function runMutation(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await action();
      invalidateCategories();
      return true;
    } catch {
      setError(MUTATION_ERROR);
      return false;
    }
  }

  function handleCreateTopLevel(event: FormEvent): void {
    event.preventDefault();
    const name = newTopLevelName.trim();
    if (!name) return;
    void runMutation(() => createCategory({ name, parentId: null })).then((ok) => {
      if (ok) setNewTopLevelName("");
    });
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only backdrop close, Escape is the keyboard equivalent (see ItemDetailModal precedent).
    // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
    <div className="form-modal-backdrop" data-testid="category-manager-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="glass form-modal-dialog category-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={deletingId === null ? handleTabKey : undefined}
      >
        <DialogHeader titleId={titleId} title="Categories" onClose={onClose} />

        {error && (
          <p className="dialog-error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {error}
          </p>
        )}

        {tree.length === 0 && (
          <div className="dialog-empty">
            <span className="dialog-empty__icon">
              <FolderTree size={20} aria-hidden="true" />
            </span>
            <p>No categories yet.</p>
          </div>
        )}
        {tree.length > 0 && (
          <ul className="category-manager__tree">
            {tree.map((node) => (
              <CategoryManagerNode
                key={node.category.id}
                node={node}
                categories={categories}
                createCategory={createCategory}
                updateCategory={updateCategory}
                onDeleteRequest={setDeletingId}
                runMutation={runMutation}
              />
            ))}
          </ul>
        )}

        <form className="category-manager__new-root" onSubmit={handleCreateTopLevel}>
          <div className="field category-manager__grow">
            <label className="field__label" htmlFor={newTopLevelInputId}>
              New top-level category
            </label>
            <span className="control-with-icon">
              <Folder size={16} aria-hidden="true" />
              <input
                id={newTopLevelInputId}
                value={newTopLevelName}
                onChange={(event) => setNewTopLevelName(event.target.value)}
                placeholder="Category name"
              />
            </span>
          </div>
          <Button type="submit" icon={Plus} aria-label="Add top-level category">
            Add category
          </Button>
        </form>
      </div>

      {deletingCategory && (
        <ConfirmDialog
          title="Delete category"
          message={`Delete "${deletingCategory.name}"? Its subcategories move up one level, and any items using it lose this category.`}
          confirmLabel="Delete"
          destructive
          onCancel={() => setDeletingId(null)}
          onConfirm={() => {
            void runMutation(() => deleteCategory(deletingCategory.id)).then(() =>
              setDeletingId(null),
            );
          }}
        />
      )}
    </div>
  );
}

interface CategoryManagerNodeProps {
  node: CategoryTreeNode;
  categories: Category[];
  createCategory: (input: CreateCategoryInput) => Promise<Category>;
  updateCategory: (id: string, input: UpdateCategoryInput) => Promise<Category>;
  onDeleteRequest: (id: string) => void;
  runMutation: (action: () => Promise<unknown>) => Promise<boolean>;
}

function CategoryManagerNode({
  node,
  categories,
  createCategory,
  updateCategory,
  onDeleteRequest,
  runMutation,
}: CategoryManagerNodeProps) {
  const { category, children } = node;
  const renameInputId = useId();
  const addChildInputId = useId();
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(category.name);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // The rename field replaces the focused Rename button, so focus moves into it.
  useEffect(() => {
    if (isRenaming) renameInputRef.current?.focus();
  }, [isRenaming]);

  const excludedIds = selfAndDescendantIds(node);
  const moveTargets = categories.filter((candidate) => !excludedIds.has(candidate.id));

  function handleRenameSubmit(event: FormEvent): void {
    event.preventDefault();
    const name = renameValue.trim();
    if (!name || name === category.name) {
      setIsRenaming(false);
      setRenameValue(category.name);
      return;
    }
    void runMutation(() => updateCategory(category.id, { name })).then((ok) => {
      if (ok) setIsRenaming(false);
    });
  }

  function handleAddChildSubmit(event: FormEvent): void {
    event.preventDefault();
    const name = childName.trim();
    if (!name) return;
    void runMutation(() => createCategory({ name, parentId: category.id })).then((ok) => {
      if (ok) {
        setChildName("");
        setIsAddingChild(false);
      }
    });
  }

  function handleMove(event: React.ChangeEvent<HTMLSelectElement>): void {
    const parentId = event.target.value === "" ? null : event.target.value;
    if (parentId === category.parentId) return;
    void runMutation(() => updateCategory(category.id, { parentId }));
  }

  const hasChildren = children.length > 0;

  return (
    <li className="category-manager__node">
      <div className="category-manager__row">
        {hasChildren ? (
          <button
            type="button"
            className="category-manager__toggle"
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${category.name}`}
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? (
              <ChevronDown size={16} aria-hidden="true" />
            ) : (
              <ChevronRight size={16} aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="category-manager__toggle" aria-hidden="true" />
        )}
        <Folder className="category-manager__folder" size={16} aria-hidden="true" />
        {isRenaming ? (
          <form className="category-manager__inline-form" onSubmit={handleRenameSubmit}>
            <label className="visually-hidden" htmlFor={renameInputId}>
              Rename {category.name}
            </label>
            <input
              id={renameInputId}
              className="category-manager__grow"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              ref={renameInputRef}
            />
            <Button type="submit" variant="accent" size="sm" icon={Check}>
              Save
            </Button>
            <IconButton
              icon={X}
              label="Cancel"
              tooltipAlign="end"
              onClick={() => {
                setIsRenaming(false);
                setRenameValue(category.name);
              }}
            />
          </form>
        ) : (
          <>
            <span className="category-manager__name">{category.name}</span>
            <span className="category-manager__actions">
              <IconButton
                icon={Pencil}
                label={`Rename ${category.name}`}
                onClick={() => setIsRenaming(true)}
              />
              <IconButton
                icon={Plus}
                label={`Add child of ${category.name}`}
                onClick={() => {
                  setIsAddingChild((current) => !current);
                  setIsExpanded(true);
                }}
              />
              {/* A native select dressed as an icon button: keeps the platform
                  picker (and its keyboard/touch behavior) for "Move to…". */}
              <span className="has-tooltip category-manager__move">
                <span className="icon-button icon-button--neutral" aria-hidden="true">
                  <FolderInput size={20} />
                </span>
                <select
                  aria-label={`Move ${category.name}`}
                  value={category.parentId ?? ""}
                  onChange={handleMove}
                >
                  <option value="">Top level</option>
                  {moveTargets.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
                <span className="tooltip" aria-hidden="true">
                  Move to…
                </span>
              </span>
              <IconButton
                icon={Trash2}
                label={`Delete ${category.name}`}
                tone="danger"
                tooltipAlign="end"
                onClick={() => onDeleteRequest(category.id)}
              />
            </span>
          </>
        )}
      </div>

      {isAddingChild && (
        <form
          className="category-manager__inline-form category-manager__add-child-form"
          onSubmit={handleAddChildSubmit}
        >
          <label className="visually-hidden" htmlFor={addChildInputId}>
            New subcategory of {category.name}
          </label>
          <span className="control-with-icon category-manager__grow">
            <Plus size={16} aria-hidden="true" />
            <input
              id={addChildInputId}
              value={childName}
              onChange={(event) => setChildName(event.target.value)}
              placeholder={`New subcategory of ${category.name}`}
            />
          </span>
          <Button type="submit" variant="accent" size="sm" icon={Plus}>
            Add
          </Button>
          <IconButton
            icon={X}
            label="Cancel"
            tooltipAlign="end"
            onClick={() => setIsAddingChild(false)}
          />
        </form>
      )}

      {hasChildren && isExpanded && (
        <ul className="category-manager__tree">
          {children.map((child) => (
            <CategoryManagerNode
              key={child.category.id}
              node={child}
              categories={categories}
              createCategory={createCategory}
              updateCategory={updateCategory}
              onDeleteRequest={onDeleteRequest}
              runMutation={runMutation}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
