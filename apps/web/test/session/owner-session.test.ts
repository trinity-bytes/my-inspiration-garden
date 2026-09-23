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

  it("resolves to owner when the includeDeleted probe succeeds (owner or write-scope only)", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ items: [], nextCursor: null }));

    await expect(detectOwnerSession()).resolves.toBe("owner");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("includeDeleted=true");
  });

  it("resolves to visitor when the probe is forbidden (no owner session)", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "forbidden", message: "no" } }, 403));

    await expect(detectOwnerSession()).resolves.toBe("visitor");
  });

  it("resolves to visitor (fail-safe) on a network failure", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new TypeError("offline"));

    await expect(detectOwnerSession()).resolves.toBe("visitor");
  });
});
