import { describe, expect, it } from "vitest";
import { firstClipboardImage } from "../../src/forms/clipboard-image";

function imageFile(name = "shot.png", type = "image/png"): File {
  return new File(["abc"], name, { type });
}

describe("firstClipboardImage", () => {
  it("returns the first image file carried in files", () => {
    const shot = imageFile();
    expect(firstClipboardImage({ files: [shot] })).toBe(shot);
  });

  it("skips non-image files in files", () => {
    const notes = new File(["abc"], "notes.txt", { type: "text/plain" });
    const shot = imageFile();
    expect(firstClipboardImage({ files: [notes, shot] })).toBe(shot);
  });

  it("falls back to items when files is empty", () => {
    const shot = imageFile();
    const data = {
      files: [],
      items: [{ kind: "file", type: "image/png", getAsFile: () => shot }],
    };
    expect(firstClipboardImage(data)).toBe(shot);
  });

  it("ignores string items and non-image file items", () => {
    const data = {
      files: [],
      items: [
        { kind: "string", type: "text/plain", getAsFile: () => null },
        { kind: "file", type: "application/pdf", getAsFile: () => null },
      ],
    };
    expect(firstClipboardImage(data)).toBeUndefined();
  });

  it("returns undefined for a missing clipboard payload", () => {
    expect(firstClipboardImage(null)).toBeUndefined();
    expect(firstClipboardImage(undefined)).toBeUndefined();
  });
});
