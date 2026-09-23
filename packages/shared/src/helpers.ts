/** Trims and lowercases a tag for storage/comparison. */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/** Converts free text into a URL-safe, lowercase, hyphenated slug. */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
