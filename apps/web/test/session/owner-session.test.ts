import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectOwnerSession } from "../../src/session/owner-session";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("detectOwnerSession", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("resolves to owner when GET /api/session reports role: owner", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ role: "owner" }));

    await expect(detectOwnerSession()).resolves.toBe("owner");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/api/session");
  });

  it("resolves to visitor when GET /api/session reports role: visitor", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ role: "visitor" }));

    await expect(detectOwnerSession()).resolves.toBe("visitor");
  });

  it("resolves to visitor (fail-closed) on an HTTP error", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "forbidden", message: "no" } }, 403));

    await expect(detectOwnerSession()).resolves.toBe("visitor");
  });

  it("resolves to visitor (fail-closed) on a network failure", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new TypeError("offline"));

    await expect(detectOwnerSession()).resolves.toBe("visitor");
  });

  it("resolves to visitor (fail-closed) on an unexpected response shape", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ role: "admin" }));

    await expect(detectOwnerSession()).resolves.toBe("visitor");
  });
});
