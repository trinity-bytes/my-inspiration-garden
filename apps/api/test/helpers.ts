import { env } from "cloudflare:test";

export async function insertCategory(
  id: string,
  overrides: Partial<{
    name: string;
    slug: string;
    parentId: string | null;
    position: number;
  }> = {},
) {
  await env.DB.prepare(
    `INSERT INTO categories (id, name, slug, parent_id, position) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      overrides.name ?? id,
      overrides.slug ?? id,
      overrides.parentId ?? null,
      overrides.position ?? 0,
    )
    .run();
}

export async function insertTag(id: string, name: string) {
  await env.DB.prepare(`INSERT INTO tags (id, name) VALUES (?, ?)`).bind(id, name).run();
}

export async function insertApiToken(
  id: string,
  overrides: {
    name?: string;
    tokenHash: string;
    scope: "read" | "write";
    revokedAt?: string | null;
  },
) {
  await env.DB.prepare(
    `INSERT INTO api_tokens (id, name, token_hash, scope, created_at, last_used_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  )
    .bind(
      id,
      overrides.name ?? "test-token",
      overrides.tokenHash,
      overrides.scope,
      "2026-09-23T00:00:00.000Z",
      overrides.revokedAt ?? null,
    )
    .run();
}

export async function hashHex(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plaintext));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
