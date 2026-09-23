import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiFetch, buildRequestUrl } from "../../src/api/client";
import { ApiError } from "../../src/api/errors";

const echoSchema = z.object({ ok: z.boolean() });

describe("buildRequestUrl", () => {
  it("joins the base url and path without duplicating slashes", () => {
    expect(buildRequestUrl("https://api.example.com", "/api/items")).toBe(
      "https://api.example.com/api/items",
    );
  });

  it("falls back to same-origin when no base url is configured", () => {
    expect(buildRequestUrl("", "/api/items")).toBe("/api/items");
  });

  it("appends scalar search params", () => {
    expect(
      buildRequestUrl("https://api.example.com", "/api/items", { color: "#F29A6B", q: "sky" }),
    ).toBe("https://api.example.com/api/items?color=%23F29A6B&q=sky");
  });

  it("appends array search params as repeated keys", () => {
    expect(
      buildRequestUrl("https://api.example.com", "/api/items", {
        kind: ["image", "link"],
      }),
    ).toBe("https://api.example.com/api/items?kind=image&kind=link");
  });

  it("omits undefined, empty-string and empty-array params", () => {
    expect(
      buildRequestUrl("https://api.example.com", "/api/items", {
        q: undefined,
        color: "",
        tag: [],
        limit: 10,
      }),
    ).toBe("https://api.example.com/api/items?limit=10");
  });
});

describe("apiFetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends same-origin credentials, the X-Garden-Client header, and parses a validated response", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await apiFetch("/api/probe", { schema: echoSchema });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/probe");
    expect(init.credentials).toBe("same-origin");
    const headers = new Headers(init.headers);
    expect(headers.get("X-Garden-Client")).toBe("web");
  });

  it("sends the X-Garden-Client header even on a bodyless GET request", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await apiFetch("/api/probe", { schema: echoSchema });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Garden-Client")).toBe("web");
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("maps a non-ok response to a typed http ApiError carrying the server code", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "forbidden", message: "nope" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const failure = await apiFetch("/api/probe", { schema: echoSchema }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    const apiError = failure as ApiError;
    expect(apiError.kind).toBe("http");
    expect(apiError.status).toBe(403);
    expect(apiError.code).toBe("forbidden");
    // Never leaks internals: the raw response body text is not the message.
    expect(apiError.message).not.toContain("nope");
  });

  it("maps a network failure to a typed network ApiError without leaking the underlying error", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new TypeError("secret internal DNS failure detail"));

    const failure = await apiFetch("/api/probe", { schema: echoSchema }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    const apiError = failure as ApiError;
    expect(apiError.kind).toBe("network");
    expect(apiError.message).not.toContain("secret internal DNS failure detail");
  });

  it("maps a response that fails schema validation to a typed invalid_response ApiError", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: "not-a-boolean" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const failure = await apiFetch("/api/probe", { schema: echoSchema }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).kind).toBe("invalid_response");
  });
});
