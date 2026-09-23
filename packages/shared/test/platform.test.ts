import { describe, expect, it } from "vitest";
import { detectPlatform } from "../src/platform";

describe("detectPlatform", () => {
  it("detects dribbble", () => {
    expect(detectPlatform("https://dribbble.com/shots/123")).toBe("dribbble");
  });

  it("detects pinterest across TLDs", () => {
    expect(detectPlatform("https://pinterest.com/pin/1")).toBe("pinterest");
    expect(detectPlatform("https://www.pinterest.fr/pin/1")).toBe("pinterest");
  });

  it("detects x for both x.com and twitter.com", () => {
    expect(detectPlatform("https://x.com/user/status/1")).toBe("x");
    expect(detectPlatform("https://twitter.com/user/status/1")).toBe("x");
  });

  it("detects behance", () => {
    expect(detectPlatform("https://www.behance.net/gallery/1")).toBe("behance");
  });

  it("detects youtube for youtube.com and youtu.be", () => {
    expect(detectPlatform("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(detectPlatform("https://youtu.be/abc")).toBe("youtube");
  });

  it("detects vimeo", () => {
    expect(detectPlatform("https://vimeo.com/12345")).toBe("vimeo");
  });

  it("falls back to other for unrecognized hosts", () => {
    expect(detectPlatform("https://example.com/article")).toBe("other");
  });

  it("falls back to other for a malformed URL", () => {
    expect(detectPlatform("not a url")).toBe("other");
  });
});
