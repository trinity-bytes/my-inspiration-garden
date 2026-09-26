import type { CreateItemInput, UpdateItemInput } from "@garden/shared";
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
  /** T11: lists exclusively soft-deleted items (the owner's trash view). */
  deletedOnly?: boolean;
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
      deletedOnly: params.deletedOnly,
    },
  });
}

/**
 * `POST /api/items` — owner-only quick-add (T11). The server assigns `id`,
 * `createdAt`, `updatedAt`; `source` is computed server-side from the
 * actor/`X-Garden-Client`, so it is never sent by the web client.
 */
export function createItem(
  input: Omit<CreateItemInput, "source">,
): Promise<z.infer<typeof itemSchema>> {
  return apiFetch("/api/items", { schema: itemSchema, method: "POST", body: input });
}

/** `PATCH /api/items/:id` — owner-only edit (T11): fields, tags, categories. */
export function updateItem(
  id: string,
  input: UpdateItemInput,
): Promise<z.infer<typeof itemSchema>> {
  return apiFetch(`/api/items/${encodeURIComponent(id)}`, {
    schema: itemSchema,
    method: "PATCH",
    body: input,
  });
}

/** `DELETE /api/items/:id` — owner-only soft delete (T11 trash). Returns the trashed item. */
export function deleteItem(id: string): Promise<z.infer<typeof itemSchema>> {
  return apiFetch(`/api/items/${encodeURIComponent(id)}`, { schema: itemSchema, method: "DELETE" });
}

/** `POST /api/items/:id/restore` — owner-only trash restore (T11). */
export function restoreItem(id: string): Promise<z.infer<typeof itemSchema>> {
  return apiFetch(`/api/items/${encodeURIComponent(id)}/restore`, {
    schema: itemSchema,
    method: "POST",
  });
}

const itemRevisionSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  snapshot: itemSchema,
  actor: z.string(),
  createdAt: z.string(),
});
export type ItemRevision = z.infer<typeof itemRevisionSchema>;
const listItemRevisionsResultSchema = z.object({ revisions: z.array(itemRevisionSchema) });

/** `GET /api/items/:id/revisions` — owner-only revision history (T11). */
export function listItemRevisions(id: string): Promise<{ revisions: ItemRevision[] }> {
  return apiFetch(`/api/items/${encodeURIComponent(id)}/revisions`, {
    schema: listItemRevisionsResultSchema,
  });
}

/** `POST /api/items/:id/revisions/:revisionId/restore` — owner-only revision restore (T11). */
export function restoreItemRevision(
  id: string,
  revisionId: string,
): Promise<z.infer<typeof itemSchema>> {
  return apiFetch(
    `/api/items/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revisionId)}/restore`,
    { schema: itemSchema, method: "POST" },
  );
}

const unfurlMetadataSchema = z.object({
  url: z.string(),
  canonicalUrl: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  siteName: z.string().optional(),
  platform: z.string(),
  previewImage: z.string().optional(),
  author: z.string().optional(),
  embed: z.string().optional(),
});
export type UnfurlMetadataResult = z.infer<typeof unfurlMetadataSchema>;

/** `POST /api/unfurl` — owner-only link preview for quick-add (T11). */
export function unfurlLink(url: string): Promise<UnfurlMetadataResult> {
  return apiFetch("/api/unfurl", { schema: unfurlMetadataSchema, method: "POST", body: { url } });
}

const storedMediaSchema = z.object({ r2Key: z.string(), mime: z.string(), size: z.number() });
export type StoredMedia = z.infer<typeof storedMediaSchema>;

/** `POST /api/media` — owner-only image/video upload for quick-add (T11), multipart. */
export function uploadMedia(file: File): Promise<StoredMedia> {
  const formData = new FormData();
  formData.set("file", file);
  return apiFetch("/api/media", { schema: storedMediaSchema, method: "POST", body: formData });
}

/** `POST /api/media/import` — owner-only remote-image import for quick-add (T11). */
export function importMedia(url: string): Promise<StoredMedia> {
  return apiFetch("/api/media/import", {
    schema: storedMediaSchema,
    method: "POST",
    body: { url },
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

const tagWithCountSchema = z.object({ id: z.string(), name: z.string(), count: z.number() });
const tagsResultSchema = z.object({ tags: z.array(tagWithCountSchema) });
export type TagsResult = z.infer<typeof tagsResultSchema>;

/** `GET /api/tags` — every tag with its item count, for the filter panel's tag list. Public read. */
export function getTags(): Promise<TagsResult> {
  return apiFetch("/api/tags", { schema: tagsResultSchema });
}

const sessionResultSchema = z.object({ role: z.enum(["owner", "visitor"]) });
export type SessionResult = z.infer<typeof sessionResultSchema>;

/**
 * `GET /api/session` — public; reports whether this browser holds the
 * owner's Cloudflare Access session (positive proof, never the owner
 * email or any credential data).
 */
export function getSession(): Promise<SessionResult> {
  return apiFetch("/api/session", { schema: sessionResultSchema });
}
