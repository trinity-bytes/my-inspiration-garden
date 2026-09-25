import type { CategoryTreeNode } from "./filter-state";

export interface CategoryTreeProps {
  nodes: CategoryTreeNode[];
  selectedIds: string[];
  onToggle: (categoryId: string) => void;
}

/**
 * Recursive category tree checkboxes. Checking a node selects only that
 * node's id — the API already expands descendants server-side
 * (`getCategoryDescendantIds`, T4), so a checked parent implicitly covers
 * every child without the UI needing to select them too.
 */
export function CategoryTree({ nodes, selectedIds, onToggle }: CategoryTreeProps) {
  if (nodes.length === 0) return null;
  return (
    <ul className="filter-panel__category-tree">
      {nodes.map((node) => (
        <li key={node.category.id}>
          <label className="filter-panel__option">
            <input
              type="checkbox"
              checked={selectedIds.includes(node.category.id)}
              onChange={() => onToggle(node.category.id)}
            />
            {node.category.name}
          </label>
          {node.children.length > 0 && (
            <CategoryTree nodes={node.children} selectedIds={selectedIds} onToggle={onToggle} />
          )}
        </li>
      ))}
    </ul>
  );
}
