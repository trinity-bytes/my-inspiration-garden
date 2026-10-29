import type { Category, ItemKind } from "@garden/shared";
import type { ListItemsParams } from "../api/endpoints";

/**
 * The filter panel's UI state (T10). Semantics match the API's existing,
 * already-shipped `ItemListQuery` (T4/T5): OR across values within the
 * `categoryId`/`kind` facets (any selected category or kind matches), AND
 * across values within the `tag` facet (an item must carry every selected
 * tag — an existing repository decision, not revisited here), AND across
 * facets (an item must satisfy every facet that has a selection). `color`
 * is single-select (the API only accepts one hex value per request).
 */
export interface FilterState {
  kinds: ItemKind[];
  tags: string[];
  categoryIds: string[];
  color: string | undefined;
  q: string;
}

export function defaultFilterState(): FilterState {
  return { kinds: [], tags: [], categoryIds: [], color: undefined, q: "" };
}

/** True once any facet has a selection or the search box has real text. */
export function isFilterActive(filters: FilterState): boolean {
  return (
    filters.kinds.length > 0 ||
    filters.tags.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.color !== undefined ||
    filters.q.trim().length > 0
  );
}

/** Number of applied facet filters (each kind, tag, category, plus the color); search text excluded. */
export function countActiveFilters(filters: FilterState): number {
  return (
    filters.kinds.length +
    filters.tags.length +
    filters.categoryIds.length +
    (filters.color === undefined ? 0 : 1)
  );
}

/** Adds `value` to `values` if absent, removes it if present. Does not mutate `values`. */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/** Maps UI filter state onto the API client's `listItems` query params. */
export function filtersToListParams(filters: FilterState): ListItemsParams {
  const q = filters.q.trim();
  return {
    kind: filters.kinds,
    tag: filters.tags,
    categoryId: filters.categoryIds,
    color: filters.color,
    q: q.length > 0 ? q : undefined,
  };
}

export interface CategoryTreeNode {
  category: Category;
  children: CategoryTreeNode[];
}

/**
 * Nests the flat `GET /api/categories` list into a tree, ordered by
 * `position` at every level. A node whose `parentId` doesn't resolve to
 * another node in the list (data inconsistency, or a parent soft-deleted
 * out of the read) is promoted to the root instead of being dropped.
 */
export function buildCategoryTree(flat: readonly Category[]): CategoryTreeNode[] {
  const nodesById = new Map<string, CategoryTreeNode>();
  for (const category of flat) {
    nodesById.set(category.id, { category, children: [] });
  }

  const roots: CategoryTreeNode[] = [];
  for (const category of flat) {
    const node = nodesById.get(category.id);
    if (!node) continue;
    const parent = category.parentId ? nodesById.get(category.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const byPosition = (a: CategoryTreeNode, b: CategoryTreeNode) =>
    a.category.position - b.category.position;
  const sortTree = (nodes: CategoryTreeNode[]): void => {
    nodes.sort(byPosition);
    for (const node of nodes) sortTree(node.children);
  };
  sortTree(roots);

  return roots;
}
