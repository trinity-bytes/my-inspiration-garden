import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";
import { signAccessJwt, TEST_AUD, testVerifyAccessJwt } from "./access-jwt-fixture";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const OWNER_EMAIL = "owner-tokens@test.dev";
const app = createApp({ verifyAccessJwt: testVerifyAccessJwt });

function testEnv() {
  return {
    ...env,
    OWNER_EMAIL,
    ACCESS_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
    ACCESS_AUD: TEST_AUD,
  };
}

async function ownerHeaders() {
  const jwt = await signAccessJwt({ email: OWNER_EMAIL });
  return {
    "Cf-Access-Jwt-Assertion": jwt,
    // Owner writes go through the CSRF guard (see test/csrf.test.ts); these
    // headers are harmless on the GET calls that reuse this helper too.
    Origin: "http://localhost:5173",
    "X-Garden-Client": "web",
  };
}

describe("POST /api/tokens", () => {
  it("shows the plaintext token once and stores only its hash", async () => {
    const res = await app.request(
      "/api/tokens",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await ownerHeaders()) },
        body: JSON.stringify({ name: "agent-one", scope: "write" }),
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
    const created = await res.json<{ id: string; token: string; name: string; scope: string }>();
    expect(created.token.startsWith("ig_")).toBe(true);

    const row = await env.DB.prepare(`SELECT token_hash FROM api_tokens WHERE id = ?`)
      .bind(created.id)
      .first<{ token_hash: string }>();
    expect(row?.token_hash).toBeDefined();
    expect(row?.token_hash).not.toBe(created.token);

    const list = await app.request("/api/tokens", { headers: await ownerHeaders() }, testEnv());
    const listBody = await list.json<{ tokens: Record<string, unknown>[] }>();
    for (const token of listBody.tokens) {
      expect(token).not.toHaveProperty("token");
      expect(token).not.toHaveProperty("tokenHash");
    }

    const withNewToken = await app.request(
      "/api/items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${created.token}` },
        body: JSON.stringify({ kind: "text", source: "web", data: { body: "hi" } }),
      },
      testEnv(),
    );
    expect(withNewToken.status).toBe(201);

    const revoke = await app.request(
      `/api/tokens/${created.id}`,
      { method: "DELETE", headers: await ownerHeaders() },
      testEnv(),
    );
    expect(revoke.status).toBe(204);

    const afterRevoke = await app.request(
      "/api/items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${created.token}` },
        body: JSON.stringify({ kind: "text", source: "web", data: { body: "hi" } }),
      },
      testEnv(),
    );
    expect(afterRevoke.status).toBe(401);
  });
});
