import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http/app";
import { hashHex, insertApiToken } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

async function writeToken(id: string, plaintext: string) {
  const tokenHash = await hashHex(plaintext);
  await insertApiToken(id, { tokenHash, scope: "write", name: "writer" });
  return { Authorization: `Bearer ${plaintext}` };
}

describe("POST /api/unfurl", () => {
  it("rejects an anonymous request", async () => {
    const res = await SELF.fetch("https://example.com/api/unfurl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an unsafe url (SSRF guard)", async () => {
    const auth = await writeToken("unfurl-ssrf", "ig_unfurl_ssrf");
    const res = await SELF.fetch("https://example.com/api/unfurl", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ url: "http://169.254.169.254/latest/meta-data" }),
    });
    expect(res.status).toBe(400);
  });

  it("prefers YouTube oEmbed over Open Graph and never fetches HTML for it", async () => {
    const auth = await writeToken("unfurl-youtube", "ig_unfurl_youtube");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("youtube.com/oembed");
      return new Response(
        JSON.stringify({
          title: "Cool Video",
          author_name: "Some Channel",
          provider_name: "YouTube",
          thumbnail_url: "https://i.ytimg.com/vi/abc/hq.jpg",
          html: "<iframe src='https://www.youtube.com/embed/abc'></iframe>",
        }),
        { headers: { "content-type": "application/json" } },
      );
    });
    const app = createApp({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await app.request(
      "https://example.com/api/unfurl",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ url: "https://www.youtube.com/watch?v=abc" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      platform: string;
      title?: string;
      author?: string;
      siteName?: string;
      previewImage?: string;
      embed?: string;
    }>();
    expect(body.platform).toBe("youtube");
    expect(body.title).toBe("Cool Video");
    expect(body.author).toBe("Some Channel");
    expect(body.siteName).toBe("YouTube");
    expect(body.previewImage).toBe("https://i.ytimg.com/vi/abc/hq.jpg");
    expect(body.embed).toContain("iframe");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to Open Graph HTML extraction when there is no oEmbed for the platform", async () => {
    const auth = await writeToken("unfurl-og", "ig_unfurl_og");
    const html = `<!doctype html><html><head>
      <title>Fallback Title</title>
      <meta property="og:title" content="OG Title" />
      <meta property="og:description" content="OG Description" />
      <meta property="og:site_name" content="Example Site" />
      <meta property="og:image" content="/images/hero.png" />
      <link rel="canonical" href="/article/1" />
    </head><body></body></html>`;
    const fetchImpl = vi.fn(
      async () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
    );
    const app = createApp({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await app.request(
      "https://example.com/api/unfurl",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ url: "https://example.com/article/1?ref=x" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      platform: string;
      title?: string;
      description?: string;
      siteName?: string;
      previewImage?: string;
      canonicalUrl?: string;
    }>();
    expect(body.platform).toBe("other");
    expect(body.title).toBe("OG Title");
    expect(body.description).toBe("OG Description");
    expect(body.siteName).toBe("Example Site");
    expect(body.previewImage).toBe("https://example.com/images/hero.png");
    expect(body.canonicalUrl).toBe("https://example.com/article/1");
  });

  it("falls back to the <title> tag when og:title is missing", async () => {
    const auth = await writeToken("unfurl-title-fallback", "ig_unfurl_title_fallback");
    const html = `<!doctype html><html><head><title>Plain Title</title></head><body></body></html>`;
    const fetchImpl = vi.fn(
      async () => new Response(html, { headers: { "content-type": "text/html" } }),
    );
    const app = createApp({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await app.request(
      "https://example.com/api/unfurl",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ url: "https://plain.example.com" }),
      },
      env,
    );
    const body = await res.json<{ title?: string }>();
    expect(body.title).toBe("Plain Title");
  });

  it("never throws when both oEmbed and HTML fetch fail; returns partial metadata", async () => {
    const auth = await writeToken("unfurl-fail", "ig_unfurl_fail");
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const app = createApp({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const res = await app.request(
      "https://example.com/api/unfurl",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ url: "https://vimeo.com/12345" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ platform: string; title?: string }>();
    expect(body.platform).toBe("vimeo");
    expect(body.title).toBeUndefined();
  });

  it("400s on a missing/invalid body", async () => {
    const auth = await writeToken("unfurl-badbody", "ig_unfurl_badbody");
    const res = await SELF.fetch("https://example.com/api/unfurl", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
