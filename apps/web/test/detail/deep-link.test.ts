import { describe, expect, it } from "vitest";
import { buildDeepLinkSearch, parseDeepLinkItemId } from "../../src/detail/deep-link";

describe("parseDeepLinkItemId", () => {
  it("extracts the item id from ?item=<id>", () => {
    expect(parseDeepLinkItemId("?item=abc123")).toBe("abc123");
  });

  it("returns null when there is no item param", () => {
    expect(parseDeepLinkItemId("")).toBeNull();
    expect(parseDeepLinkItemId("?foo=bar")).toBeNull();
  });

  it("returns null for an empty item param", () => {
    expect(parseDeepLinkItemId("?item=")).toBeNull();
  });

  it("decodes a URL-encoded id", () => {
    expect(parseDeepLinkItemId("?item=abc%20123")).toBe("abc 123");
  });

  it("ignores other params alongside item", () => {
    expect(parseDeepLinkItemId("?foo=bar&item=xyz&baz=1")).toBe("xyz");
  });
});

describe("buildDeepLinkSearch", () => {
  it("returns ?item=<id> for a given id", () => {
    expect(buildDeepLinkSearch("abc123")).toBe("?item=abc123");
  });

  it("returns an empty string when the id is null (closed)", () => {
    expect(buildDeepLinkSearch(null)).toBe("");
  });

  it("encodes special characters in the id", () => {
    // URLSearchParams encodes a space as "+" (application/x-www-form-urlencoded);
    // parseDeepLinkItemId decodes it back correctly either way (see the round-trip test below).
    expect(buildDeepLinkSearch("abc 123")).toBe("?item=abc+123");
  });

  it("round-trips through parseDeepLinkItemId", () => {
    const id = "some-id_123";
    expect(parseDeepLinkItemId(buildDeepLinkSearch(id))).toBe(id);
  });
});
