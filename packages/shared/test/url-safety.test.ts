import { describe, expect, it } from "vitest";
import { isSafeFetchUrl } from "../src/url-safety";

describe("isSafeFetchUrl", () => {
  it("accepts ordinary https URLs", () => {
    expect(isSafeFetchUrl("https://example.com/page")).toBe(true);
  });

  it("accepts ordinary http URLs", () => {
    expect(isSafeFetchUrl("http://example.com/page")).toBe(true);
  });

  it("rejects non-http(s) protocols", () => {
    expect(isSafeFetchUrl("ftp://example.com/file")).toBe(false);
    expect(isSafeFetchUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeFetchUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isSafeFetchUrl("not a url")).toBe(false);
  });

  it("rejects localhost and .localhost", () => {
    expect(isSafeFetchUrl("http://localhost/")).toBe(false);
    expect(isSafeFetchUrl("http://foo.localhost/")).toBe(false);
  });

  it("rejects loopback and private IPv4 literals", () => {
    expect(isSafeFetchUrl("http://127.0.0.1/")).toBe(false);
    expect(isSafeFetchUrl("http://10.0.0.5/")).toBe(false);
    expect(isSafeFetchUrl("http://192.168.1.1/")).toBe(false);
    expect(isSafeFetchUrl("http://172.16.0.1/")).toBe(false);
  });

  it("rejects link-local IPv4 (169.254.0.0/16, incl. cloud metadata)", () => {
    expect(isSafeFetchUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
  });

  it("rejects IPv6 loopback and link-local literals", () => {
    expect(isSafeFetchUrl("http://[::1]/")).toBe(false);
    expect(isSafeFetchUrl("http://[fe80::1]/")).toBe(false);
  });

  it("accepts a public IPv4 literal", () => {
    expect(isSafeFetchUrl("http://93.184.216.34/")).toBe(true);
  });
});
