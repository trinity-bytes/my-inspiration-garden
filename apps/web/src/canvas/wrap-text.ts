/**
 * Pure word-wrap + ellipsis-truncation, measured through an injected
 * `measure` function (so callers — every per-kind card painter,
 * `card-painters.ts` — pass `(text) => ctx.measureText(text).width` and the
 * logic itself stays unit-testable without a real 2D canvas). Replaces
 * `placeholder-texture.ts`'s old inline word-wrap, which silently
 * hard-clipped overflow with no ellipsis (T9: "titles are hard-clipped
 * like 'Longer text item to chec'" bug).
 */

export interface WrapTextResult {
  lines: string[];
  /** True when the text did not fully fit within `maxLines` and the last line was ellipsis-truncated. */
  truncated: boolean;
}

/** Greedy word-wrap with no line-count limit: every word that fits alongside the current line joins it, otherwise a new line starts. Never breaks a single word mid-character. */
function greedyWrapLines(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const lines: string[] = [];
  let current = words[0] as string;
  for (let i = 1; i < words.length; i++) {
    const word = words[i] as string;
    const candidate = `${current} ${word}`;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/** Trims `line` (at the character level, from the end) until `line…` fits within `maxWidth`, appending the ellipsis. Falls back to a bare ellipsis if even that alone doesn't fit. */
function withEllipsis(line: string, measure: (text: string) => number, maxWidth: number): string {
  if (measure(`${line}…`) <= maxWidth) {
    return `${line}…`;
  }
  let trimmed = line;
  while (trimmed.length > 0 && measure(`${trimmed}…`) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  trimmed = trimmed.trimEnd();
  return trimmed.length > 0 ? `${trimmed}…` : "…";
}

/**
 * Wraps `text` to fit within `maxWidth` (per `measure`), capped at
 * `maxLines`. When the full text does not fit, the last kept line is
 * ellipsis-truncated at a word (then, if still needed, character) boundary
 * and `truncated` is `true`.
 */
export function wrapText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): WrapTextResult {
  const safeMaxLines = Math.max(1, Math.floor(maxLines));
  const safeMaxWidth = Math.max(maxWidth, 1);
  const allLines = greedyWrapLines(measure, text, safeMaxWidth);

  if (allLines.length === 0) {
    return { lines: [], truncated: false };
  }
  if (allLines.length <= safeMaxLines) {
    return { lines: allLines, truncated: false };
  }

  const kept = allLines.slice(0, safeMaxLines);
  const lastIndex = safeMaxLines - 1;
  kept[lastIndex] = withEllipsis(kept[lastIndex] as string, measure, safeMaxWidth);
  return { lines: kept, truncated: true };
}
