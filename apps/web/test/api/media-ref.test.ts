import { describe, expect, it } from "vitest";
import { resolveMediaRef } from "../../src/api/media-ref";

describe("resolveMediaRef", () => {
  it("returns http(s) and data URLs unchanged", () => {
    expect(resolveMediaRef("https://cdn.example.com/a.png", "https://api.test")).toBe(
      "https://cdn.example.com/a.png",
    );
    expect(resolveMediaRef("http://cdn.example.com/a.png")).toBe("http://cdn.example.com/a.png");
    expect(resolveMediaRef("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });

  it("maps an R2 key to the media endpoint under the api base url", () => {
    expect(resolveMediaRef("media/2026/10/abc.png", "https://api.test")).toBe(
      "https://api.test/api/media/media/2026/10/abc.png",
    );
  });

  it("defaults to a same-origin path", () => {
    expect(resolveMediaRef("media/2026/10/abc.png")).toBe("/api/media/media/2026/10/abc.png");
  });
});
