import { describe, expect, it } from "vitest";
import { wrapText } from "../../src/canvas/wrap-text";

/** A deterministic fake measurer: each character is exactly 10 units wide (a space too), so expected widths are trivial to compute by hand. */
function fixedWidthMeasure(charWidth = 10): (text: string) => number {
  return (text: string) => text.length * charWidth;
}

describe("wrapText", () => {
  it("returns a single line, untruncated, when the text fits maxWidth", () => {
    const result = wrapText(fixedWidthMeasure(), "short title", 500, 3);
    expect(result.lines).toEqual(["short title"]);
    expect(result.truncated).toBe(false);
  });

  it("wraps at word boundaries when a line would exceed maxWidth", () => {
    // "aa bb cc dd" at 10/char: "aa bb" = 50, "aa bb cc" = 80 > maxWidth 70.
    const result = wrapText(fixedWidthMeasure(), "aa bb cc dd", 70, 4);
    expect(result.lines).toEqual(["aa bb", "cc dd"]);
    expect(result.truncated).toBe(false);
  });

  it("never breaks a word mid-character just because it doesn't fit alongside a previous word", () => {
    const result = wrapText(fixedWidthMeasure(), "hello world", 40, 4);
    expect(result.lines).toEqual(["hello", "world"]);
  });

  it("truncates to maxLines and appends an ellipsis to the last kept line when there is overflow", () => {
    const result = wrapText(fixedWidthMeasure(), "aa bb cc dd ee ff", 70, 2);
    expect(result.lines).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(result.lines[1]?.endsWith("…")).toBe(true);
  });

  it("does not report truncation when the content exactly fits maxLines", () => {
    const result = wrapText(fixedWidthMeasure(), "aa bb cc dd", 70, 2);
    expect(result.lines).toEqual(["aa bb", "cc dd"]);
    expect(result.truncated).toBe(false);
  });

  it("the ellipsis-bearing last line still fits within maxWidth", () => {
    const measure = fixedWidthMeasure();
    const result = wrapText(measure, "aa bb cc dd ee ff gg hh", 70, 1);
    expect(result.truncated).toBe(true);
    const lastLine = result.lines[result.lines.length - 1] as string;
    expect(measure(lastLine)).toBeLessThanOrEqual(70);
    expect(lastLine.endsWith("…")).toBe(true);
  });

  it("returns no lines for empty/whitespace-only text", () => {
    expect(wrapText(fixedWidthMeasure(), "", 200, 3)).toEqual({ lines: [], truncated: false });
    expect(wrapText(fixedWidthMeasure(), "   ", 200, 3)).toEqual({ lines: [], truncated: false });
  });

  it("collapses internal whitespace runs the same as a single space", () => {
    const result = wrapText(fixedWidthMeasure(), "aa   bb\ncc", 500, 3);
    expect(result.lines).toEqual(["aa bb cc"]);
  });

  it("is a pure function: identical inputs produce identical output", () => {
    const measure = fixedWidthMeasure();
    expect(wrapText(measure, "aa bb cc dd", 70, 2)).toEqual(
      wrapText(measure, "aa bb cc dd", 70, 2),
    );
  });

  it("respects maxLines=1 (single-line ellipsis truncation, e.g. a domain label)", () => {
    const result = wrapText(fixedWidthMeasure(), "a very long domain name example", 100, 1);
    expect(result.lines).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.lines[0]?.endsWith("…")).toBe(true);
  });

  it("a single word wider than maxWidth is still placed alone on its own line (no mid-word breaking)", () => {
    const result = wrapText(fixedWidthMeasure(), "supercalifragilisticexpialidocious", 50, 3);
    expect(result.lines).toEqual(["supercalifragilisticexpialidocious"]);
    expect(result.truncated).toBe(false);
  });
});
