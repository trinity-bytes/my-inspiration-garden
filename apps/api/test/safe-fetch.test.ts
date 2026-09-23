import { describe, expect, it, vi } from "vitest";
import { safeFetch } from "../src/lib/safe-fetch";

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe("safeFetch", () => {
  it("rejects the initial url when unsafe, without calling fetchImpl", async () => {
    const fetchImpl = vi.fn();
    const res = await safeFetch(fetchImpl as unknown as typeof fetch, "http://127.0.0.1/");
    expect(res).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the response directly when there is no redirect", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const res = await safeFetch(fetchImpl as unknown as typeof fetch, "https://example.com/");
    expect(res?.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows a safe redirect chain up to maxRedirects and returns the final response", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls <= 5) return redirectResponse(`https://example.com/hop-${calls}`);
      return new Response("final", { status: 200 });
    });
    const res = await safeFetch(
      fetchImpl as unknown as typeof fetch,
      "https://example.com/start",
      {},
      { maxRedirects: 5 },
    );
    expect(res?.status).toBe(200);
    expect(await res?.text()).toBe("final");
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("rejects a redirect chain longer than maxRedirects, without ever fetching past the cap", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return redirectResponse(`https://example.com/hop-${calls}`);
    });
    const res = await safeFetch(
      fetchImpl as unknown as typeof fetch,
      "https://example.com/start",
      {},
      { maxRedirects: 5 },
    );
    expect(res).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("rejects when a redirect hop resolves to a private/loopback/link-local address (SSRF via redirect)", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectResponse("http://169.254.169.254/latest/meta-data"),
    );
    const res = await safeFetch(fetchImpl as unknown as typeof fetch, "https://example.com/start");
    expect(res).toBeNull();
    // the unsafe hop is validated before it is ever fetched
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects when a redirect hop resolves to localhost", async () => {
    const fetchImpl = vi.fn(async () => redirectResponse("http://localhost:8080/admin"));
    const res = await safeFetch(fetchImpl as unknown as typeof fetch, "https://example.com/start");
    expect(res).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("resolves a relative Location header against the current hop's url", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls += 1;
      if (calls === 1) {
        expect(String(input)).toBe("https://example.com/start");
        return redirectResponse("/next");
      }
      expect(String(input)).toBe("https://example.com/next");
      return new Response("ok", { status: 200 });
    });
    const res = await safeFetch(fetchImpl as unknown as typeof fetch, "https://example.com/start");
    expect(res?.status).toBe(200);
  });

  it("returns null when a redirect has no Location header", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302 }));
    const res = await safeFetch(fetchImpl as unknown as typeof fetch, "https://example.com/start");
    expect(res).toBeNull();
  });

  it("returns null when fetchImpl throws (network error/timeout)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const res = await safeFetch(fetchImpl as unknown as typeof fetch, "https://example.com/start");
    expect(res).toBeNull();
  });

  it("requests every hop with redirect: manual regardless of the caller's init", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return new Response("ok", { status: 200 });
    });
    await safeFetch(fetchImpl as unknown as typeof fetch, "https://example.com/start", {
      redirect: "follow",
    });
  });
});
