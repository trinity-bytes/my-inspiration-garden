import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
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
