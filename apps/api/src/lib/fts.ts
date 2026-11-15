/**
 * Turns free user input into a syntactically valid FTS5 MATCH query.
 *
 * FTS5's query syntax treats `"`, `*`, `(`, `)`, `AND`, `OR`, `NOT`, `-` etc.
 * as operators, so passing `q` straight into `MATCH` lets a search box throw
 * a syntax error (or silently change meaning) on ordinary input like `"cats"
 * OR (nice)`. Each whitespace-separated word is wrapped as an escaped phrase,
 * so every character stays a literal, and suffixed with `*` so it matches as
 * a prefix (`insp` finds "inspiration"). FTS5 joins adjacent phrases with an
 * implicit AND, so an item must contain every word, in any order and in any
 * indexed column. Boolean operators are not supported, an acceptable trade
 * for a single search box.
 */
export function sanitizeFtsQuery(q: string): string {
  return q
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => `"${word.replace(/"/g, '""')}"*`)
    .join(" ");
}
