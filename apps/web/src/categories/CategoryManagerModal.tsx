import type { Category, CreateCategoryInput, UpdateCategoryInput } from "@garden/shared";
import { type FormEvent, useId, useRef, useState } from "react";
import {
  createCategory as createCategoryDefault,
  deleteCategory as deleteCategoryDefault,
  updateCategory as updateCategoryDefault,
} from "../api/endpoints";
import { ConfirmDialog } from "../components/Dialog/ConfirmDialog";
import { useDialogFocusTrap } from "../components/Dialog/useDialogFocusTrap";
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
        <h2 id={titleId} className="form-modal__title">
          Categories
        </h2>

        {error && (
          <p className="item-form__error" role="alert">
            {error}
          </p>
        )}

        {tree.length === 0 && <p>No categories yet.</p>}
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
          <label htmlFor={newTopLevelInputId}>New top-level category</label>
          <input
            id={newTopLevelInputId}
            value={newTopLevelName}
            onChange={(event) => setNewTopLevelName(event.target.value)}
            placeholder="Category name"
          />
          <button type="submit">Add top-level category</button>
        </form>

        <div className="item-form__actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
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

  return (
    <li className="category-manager__node">
      <div className="category-manager__row">
        {isRenaming ? (
          <form className="category-manager__rename-form" onSubmit={handleRenameSubmit}>
            <label htmlFor={renameInputId}>Rename {category.name}</label>
            <input
              id={renameInputId}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
            <button type="submit">Save</button>
            <button
              type="button"
              onClick={() => {
                setIsRenaming(false);
                setRenameValue(category.name);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span className="category-manager__name">{category.name}</span>
            <button
              type="button"
              aria-label={`Rename ${category.name}`}
              onClick={() => setIsRenaming(true)}
            >
              Rename
            </button>
            <button
              type="button"
              aria-label={`Add child of ${category.name}`}
              onClick={() => setIsAddingChild((current) => !current)}
            >
              Add child
            </button>
            <label className="category-manager__move">
              Move to
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
            </label>
            <button
              type="button"
              aria-label={`Delete ${category.name}`}
              onClick={() => onDeleteRequest(category.id)}
            >
              Delete
            </button>
          </>
        )}
      </div>

      {isAddingChild && (
        <form className="category-manager__add-child-form" onSubmit={handleAddChildSubmit}>
          <label htmlFor={addChildInputId}>New subcategory of {category.name}</label>
          <input
            id={addChildInputId}
            value={childName}
            onChange={(event) => setChildName(event.target.value)}
          />
          <button type="submit">Add</button>
          <button type="button" onClick={() => setIsAddingChild(false)}>
            Cancel
          </button>
        </form>
      )}

      {children.length > 0 && (
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
