import { categorySchema, itemSchema } from "@garden/shared";
import { z } from "zod";
import { apiFetch } from "./client";

const listItemsResultSchema = z.object({
  items: z.array(itemSchema),
  nextCursor: z.string().nullable(),
});
export type ListItemsResult = z.infer<typeof listItemsResultSchema>;

export interface ListItemsParams {
  kind?: string[];
  tag?: string[];
  categoryId?: string[];
  color?: string;
  q?: string;
  cursor?: string;
  limit?: number;
  includeDeleted?: boolean;
}

/** `GET /api/items` — filtered, cursor-paginated item list. Public read. */
export function listItems(params: ListItemsParams = {}): Promise<ListItemsResult> {
  return apiFetch("/api/items", {
    schema: listItemsResultSchema,
    searchParams: {
      kind: params.kind,
      tag: params.tag,
      categoryId: params.categoryId,
      color: params.color,
      q: params.q,
      cursor: params.cursor,
      limit: params.limit,
      includeDeleted: params.includeDeleted,
    },
  });
}

/** `GET /api/items/:id` — single item detail. Public read. */
export function getItem(id: string) {
  return apiFetch(`/api/items/${encodeURIComponent(id)}`, { schema: itemSchema });
}

const categoryTreeResultSchema = z.object({ categories: z.array(categorySchema) });
export type CategoryTreeResult = z.infer<typeof categoryTreeResultSchema>;

/**
 * `GET /api/categories` — the flat category list (`parentId` links each node
 * to its parent; the UI builds the tree from this list).
 */
export function getCategoryTree(): Promise<CategoryTreeResult> {
  return apiFetch("/api/categories", { schema: categoryTreeResultSchema });
}
