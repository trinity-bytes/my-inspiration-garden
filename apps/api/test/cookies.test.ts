import { describe, expect, it } from "vitest";
import { readCookie } from "../src/lib/cookies";

describe("readCookie", () => {
  it("returns null when the Cookie header is absent", () => {
    expect(readCookie(undefined, "CF_Authorization")).toBeNull();
  });

  it("reads a single cookie value", () => {
    expect(readCookie("CF_Authorization=abc.def.ghi", "CF_Authorization")).toBe("abc.def.ghi");
  });

  it("reads the named cookie among several, ignoring order and spacing", () => {
    const header = "theme=dark; CF_Authorization=abc.def.ghi ; other=1";
    expect(readCookie(header, "CF_Authorization")).toBe("abc.def.ghi");
  });

  it("returns null when the named cookie is not present", () => {
    expect(readCookie("theme=dark; other=1", "CF_Authorization")).toBeNull();
  });

  it("percent-decodes the value", () => {
    expect(readCookie("CF_Authorization=abc%2Edef", "CF_Authorization")).toBe("abc.def");
  });

  it("falls back to the raw value when percent-decoding fails, instead of throwing", () => {
    expect(readCookie("CF_Authorization=abc%zzdef", "CF_Authorization")).toBe("abc%zzdef");
  });

  it("ignores malformed pairs without '=' rather than throwing", () => {
    const header = "garbage;;; CF_Authorization=abc.def.ghi ;===nope";
    expect(readCookie(header, "CF_Authorization")).toBe("abc.def.ghi");
  });

  it("returns null for an empty cookie value", () => {
    expect(readCookie("CF_Authorization=; other=1", "CF_Authorization")).toBeNull();
  });

  it("returns null for a completely garbage header", () => {
    expect(readCookie("!!!not-a-cookie-header###", "CF_Authorization")).toBeNull();
  });
});
