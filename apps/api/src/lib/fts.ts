/**
 * Turns free user input into a syntactically valid FTS5 MATCH query.
 *
 * FTS5's query syntax treats `"`, `*`, `(`, `)`, `AND`, `OR`, `NOT`, `-` etc.
 * as operators, so passing `q` straight into `MATCH` lets a search box throw
 * a syntax error (or silently change meaning) on ordinary input like `"cats"
 * OR (nice)`. Wrapping the whole input as one escaped phrase turns every
 * character into a literal token to match in sequence, at the cost of
 * boolean operators — an acceptable trade for a single search box.
 */
export function sanitizeFtsQuery(q: string): string {
  const escaped = q.replace(/"/g, '""');
  return `"${escaped}"`;
}
