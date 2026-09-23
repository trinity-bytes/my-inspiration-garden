import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app";
import { hashHex, insertApiToken } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

// A minimal but valid 1x1 PNG (magic bytes + a plausible tail), enough to
// pass sniffMime without needing a real decoded image.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0xd, 0x49, 0x48, 0x44, 0x52,
]);

async function writeToken(id: string, plaintext: string) {
  const tokenHash = await hashHex(plaintext);
  await insertApiToken(id, { tokenHash, scope: "write", name: "writer" });
  return { Authorization: `Bearer ${plaintext}` };
}

beforeEach(async () => {
  // clean R2 between tests
  const listed = await env.MEDIA.list();
  for (const obj of listed.objects) await env.MEDIA.delete(obj.key);
});

describe("POST /api/media", () => {
  it("rejects an anonymous upload", async () => {
    const form = new FormData();
    form.set("file", new Blob([PNG_BYTES]), "a.png");
    const res = await SELF.fetch("https://example.com/api/media", { method: "POST", body: form });
    expect(res.status).toBe(401);
  });

  it("uploads a valid png and stores it in R2 under media/<yyyy>/<mm>/<ulid>.png", async () => {
    const auth = await writeToken("media-upload", "ig_media_upload");
    const form = new FormData();
    form.set("file", new Blob([PNG_BYTES]), "a.png");
    const res = await SELF.fetch("https://example.com/api/media", {
      method: "POST",
      headers: auth,
      body: form,
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ r2Key: string; mime: string; size: number }>();
    expect(body.mime).toBe("image/png");
    expect(body.r2Key).toMatch(/^media\/\d{4}\/\d{2}\/.+\.png$/);
    expect(body.size).toBe(PNG_BYTES.byteLength);

    const stored = await env.MEDIA.get(body.r2Key);
    expect(stored).not.toBeNull();
  });

  it("rejects content whose magic bytes don't match a supported image/video type", async () => {
    const auth = await writeToken("media-badtype", "ig_media_badtype");
    const form = new FormData();
    form.set("file", new Blob([new TextEncoder().encode("not an image")]), "a.txt");
    const res = await SELF.fetch("https://example.com/api/media", {
      method: "POST",
      headers: auth,
      body: form,
    });
    expect(res.status).toBe(422);
  });

  it("rejects a request missing the file field", async () => {
    const auth = await writeToken("media-nofile", "ig_media_nofile");
    const form = new FormData();
    form.set("notfile", "x");
    const res = await SELF.fetch("https://example.com/api/media", {
      method: "POST",
      headers: auth,
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it("rejects a file over the configured size limit for its type", async () => {
    const auth = await writeToken("media-toobig", "ig_media_toobig");
    // The generated `Env` type literal-types this var from its wrangler.jsonc
    // default; cast to mutate it for this one test.
    const envVars = env as unknown as { MAX_IMAGE_BYTES: string };
    const previous = envVars.MAX_IMAGE_BYTES;
    envVars.MAX_IMAGE_BYTES = String(PNG_BYTES.byteLength - 1);
    try {
      const form = new FormData();
      form.set("file", new Blob([PNG_BYTES]), "a.png");
      const res = await SELF.fetch("https://example.com/api/media", {
        method: "POST",
        headers: auth,
        body: form,
      });
      expect(res.status).toBe(422);
    } finally {
      envVars.MAX_IMAGE_BYTES = previous;
    }
  });
});

describe("POST /api/media/import", () => {
  function redirectResponse(location: string, status = 302): Response {
    return new Response(null, { status, headers: { location } });
  }

  it("fetches, validates, and stores a safe remote image", async () => {
    const auth = await writeToken("media-import-ok", "ig_media_import_ok");
    const fetchImpl = vi.fn(
      async () =>
        new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const app = createApp({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await app.request(
      "https://example.com/api/media/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ url: "https://cdn.example.com/hero.png" }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ r2Key: string; mime: string }>();
    expect(body.mime).toBe("image/png");
    expect(await env.MEDIA.get(body.r2Key)).not.toBeNull();
  });

  it("rejects a directly unsafe url before ever fetching", async () => {
    const auth = await writeToken("media-import-unsafe", "ig_media_import_unsafe");
    const fetchImpl = vi.fn();
    const app = createApp({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await app.request(
      "https://example.com/api/media/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ url: "http://169.254.169.254/latest/meta-data" }),
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requests with redirect: manual (never delegates redirect-following to the platform)", async () => {
    const auth = await writeToken("media-import-manual-mode", "ig_media_import_manual_mode");
    const fetchImpl = vi.fn(
      async () =>
        new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const app = createApp({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await app.request(
      "https://example.com/api/media/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ url: "https://public.example.com/start" }),
      },
      env,
    );
    // `redirect: "follow"` would let the platform silently auto-follow a
    // redirect to a private/loopback/link-local address, bypassing
    // isSafeFetchUrl entirely, since the caller never sees the intermediate
    // 3xx or its Location. Requesting "manual" is what makes each hop
    // observable and revalidatable.
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("rejects a remote image fetch that 302-redirects to a private/loopback address (SSRF via redirect)", async () => {
    const auth = await writeToken("media-import-redirect-ssrf", "ig_media_import_redirect_ssrf");
    const fetchImpl = vi.fn(async () =>
      redirectResponse("http://169.254.169.254/latest/meta-data"),
    );
    const app = createApp({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await app.request(
      "https://example.com/api/media/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ url: "https://public.example.com/redirect" }),
      },
      env,
    );
    expect(res.status).toBe(422);
    // the unsafe hop is validated before it is ever fetched a second time
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect chain longer than the configured cap, walking every hop manually", async () => {
    const auth = await writeToken("media-import-too-many-redirects", "ig_media_import_redirects");
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return redirectResponse(`https://public.example.com/hop-${calls}`);
    });
    const app = createApp({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await app.request(
      "https://example.com/api/media/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ url: "https://public.example.com/start" }),
      },
      env,
    );
    expect(res.status).toBe(422);
    // proves the redirect chain was actually walked hop by hop (maxRedirects(5) + 1 initial
    // request) rather than bailing out after a single non-2xx response
    expect(calls).toBe(6);
  });

  it("follows a safe redirect chain to the final image", async () => {
    const auth = await writeToken("media-import-safe-redirect", "ig_media_import_safe_redirect");
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return redirectResponse("https://cdn.example.com/final.png");
      return new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } });
    });
    const app = createApp({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await app.request(
      "https://example.com/api/media/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ url: "https://public.example.com/start" }),
      },
      env,
    );
    expect(res.status).toBe(201);
  });
});

describe("GET /api/media/*key", () => {
  it("streams a stored object publicly with long-cache headers and an ETag", async () => {
    const auth = await writeToken("media-get", "ig_media_get");
    const form = new FormData();
    form.set("file", new Blob([PNG_BYTES]), "a.png");
    const uploadRes = await SELF.fetch("https://example.com/api/media", {
      method: "POST",
      headers: auth,
      body: form,
    });
    const { r2Key } = await uploadRes.json<{ r2Key: string }>();

    const res = await SELF.fetch(`https://example.com/api/media/${r2Key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("ETag")).toBeTruthy();
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes).toEqual(PNG_BYTES);
  });

  it("404s for a missing key", async () => {
    const res = await SELF.fetch("https://example.com/api/media/media/2026/01/missing.png");
    expect(res.status).toBe(404);
  });
});
