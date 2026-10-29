import type { CategoryTreeNode } from "./filter-state";

/** True when any descendant of `node` (not the node itself) is selected. */
function hasSelectedDescendant(node: CategoryTreeNode, selectedIds: readonly string[]): boolean {
  return node.children.some(
    (child) => selectedIds.includes(child.category.id) || hasSelectedDescendant(child, selectedIds),
  );
}

export interface CategoryTreeProps {
  nodes: CategoryTreeNode[];
  selectedIds: string[];
  onToggle: (categoryId: string) => void;
}

/**
 * Recursive category tree checkboxes. Checking a node selects only that
 * node's id — the API already expands descendants server-side
 * (`getCategoryDescendantIds`, T4), so a checked parent implicitly covers
 * every child without the UI needing to select them too. An unchecked
 * parent with a selected descendant shows the mixed state (Figma Checkbox
 * v2); it is purely visual, clicking still selects that parent.
 */
export function CategoryTree({ nodes, selectedIds, onToggle }: CategoryTreeProps) {
  if (nodes.length === 0) return null;
  return (
    <ul className="filter-panel__category-tree">
      {nodes.map((node) => {
        const checked = selectedIds.includes(node.category.id);
        const mixed = !checked && hasSelectedDescendant(node, selectedIds);
        return (
          <li key={node.category.id}>
            <label className="filter-panel__option">
              <input
                type="checkbox"
                checked={checked}
                aria-checked={mixed ? "mixed" : checked}
                ref={(input) => {
                  if (input) input.indeterminate = mixed;
                }}
                onChange={() => onToggle(node.category.id)}
              />
              {node.category.name}
            </label>
            {node.children.length > 0 && (
              <CategoryTree nodes={node.children} selectedIds={selectedIds} onToggle={onToggle} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
