import type { TagsResult } from "../api/endpoints";

export type TagWithCount = TagsResult["tags"][number];

/** "count" lists the most used tags first; "name" is A–Z. */
export type TagSort = "count" | "name";

/**
 * Returns a sorted copy of `tags`. By count, ties fall back to the name so
 * the order is stable across reloads (the API returns tags unordered).
 */
export function sortTags(tags: readonly TagWithCount[], sort: TagSort): TagWithCount[] {
  const byName = (a: TagWithCount, b: TagWithCount) => a.name.localeCompare(b.name);
  return [...tags].sort(sort === "count" ? (a, b) => b.count - a.count || byName(a, b) : byName);
}

/** Tags whose name contains `query`, case-insensitive; every tag when the query is blank. */
export function matchTags(tags: readonly TagWithCount[], query: string): TagWithCount[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...tags];
  return tags.filter((tag) => tag.name.toLowerCase().includes(needle));
}
