import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";
import { signAccessJwt, TEST_AUD, testVerifyAccessJwt } from "./access-jwt-fixture";
import { hashHex, insertApiToken } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const OWNER_EMAIL = "owner@test.dev";

function testEnv(overrides: Record<string, string> = {}) {
  return {
    ...env,
    OWNER_EMAIL,
    ACCESS_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
    ACCESS_AUD: TEST_AUD,
    ...overrides,
  };
}

const app = createApp({ verifyAccessJwt: testVerifyAccessJwt });

const validTextItemBody = { kind: "text", source: "web", data: { body: "hello" } };

async function postItem(
  headers: Record<string, string>,
  envOverrides: Record<string, string> = {},
) {
  return app.request(
    "/api/items",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(validTextItemBody),
    },
    testEnv(envOverrides),
  );
}

describe("write auth matrix (POST /api/items)", () => {
  it("401s an anonymous request (no credentials)", async () => {
    const res = await postItem({});
    expect(res.status).toBe(401);
  });

  it("403s a read-scope token", async () => {
    const tokenHash = await hashHex("ig_matrix_read");
    await insertApiToken("matrix-read", { tokenHash, scope: "read" });
    const res = await postItem({ Authorization: "Bearer ig_matrix_read" });
    expect(res.status).toBe(403);
  });

  it("201s a write-scope token", async () => {
    const tokenHash = await hashHex("ig_matrix_write");
    await insertApiToken("matrix-write", { tokenHash, scope: "write", name: "agent-x" });
    const res = await postItem({ Authorization: "Bearer ig_matrix_write" });
    expect(res.status).toBe(201);
    const body = await res.json<{ source: string }>();
    expect(body.source).toBe("agent:agent-x");
  });

  it("401s a revoked token", async () => {
    const tokenHash = await hashHex("ig_matrix_revoked");
    await insertApiToken("matrix-revoked", {
      tokenHash,
      scope: "write",
      revokedAt: "2026-01-01T00:00:00.000Z",
    });
    const res = await postItem({ Authorization: "Bearer ig_matrix_revoked" });
    expect(res.status).toBe(401);
  });

  it("201s a valid owner Access JWT", async () => {
    const jwt = await signAccessJwt({ email: OWNER_EMAIL });
    const res = await postItem({
      "Cf-Access-Jwt-Assertion": jwt,
      // Access-authenticated writes go through the CSRF guard too (see
      // test/csrf.test.ts for the dedicated coverage); satisfy it here.
      Origin: "http://localhost:5173",
      "X-Garden-Client": "web",
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ source: string }>();
    expect(body.source).toBe("web");
  });

  it("401s a malformed Access JWT", async () => {
    const res = await postItem({ "Cf-Access-Jwt-Assertion": "not-a-real-jwt" });
    expect(res.status).toBe(401);
  });

  it("401s an Access JWT signed for the wrong aud", async () => {
    const jwt = await signAccessJwt({ email: OWNER_EMAIL }, { audience: "wrong-aud" });
    const res = await postItem({ "Cf-Access-Jwt-Assertion": jwt });
    expect(res.status).toBe(401);
  });

  it("401s an Access JWT for a non-owner email", async () => {
    const jwt = await signAccessJwt({ email: "someone-else@test.dev" });
    const res = await postItem({ "Cf-Access-Jwt-Assertion": jwt });
    expect(res.status).toBe(401);
  });

  it("honors DEV_OWNER_BYPASS as owner", async () => {
    const res = await postItem({}, { DEV_OWNER_BYPASS: "true" });
    expect(res.status).toBe(201);
  });

  it.each(["1", "false", "TRUE", "yes", " true", "true "])(
    'does NOT bypass for DEV_OWNER_BYPASS=%j (only exact "true" qualifies)',
    async (value) => {
      const res = await postItem({}, { DEV_OWNER_BYPASS: value });
      expect(res.status).toBe(401);
    },
  );
});

describe("token client header source rule", () => {
  it("uses agent:<name> by default and the client header when declared", async () => {
    const tokenHash = await hashHex("ig_client_header");
    await insertApiToken("client-header-token", { tokenHash, scope: "write", name: "browser-ext" });

    const withoutHeader = await postItem({ Authorization: "Bearer ig_client_header" });
    expect((await withoutHeader.json<{ source: string }>()).source).toBe("agent:browser-ext");

    const withHeader = await postItem({
      Authorization: "Bearer ig_client_header",
      "X-Garden-Client": "extension",
    });
    expect((await withHeader.json<{ source: string }>()).source).toBe("extension");
  });
});

describe("requireOwner (tokens endpoints)", () => {
  it("401s anonymous, 403s a write token, 200s the owner", async () => {
    const anon = await app.request("/api/tokens", { method: "GET" }, testEnv());
    expect(anon.status).toBe(401);

    const tokenHash = await hashHex("ig_owner_only_check");
    await insertApiToken("owner-only-check", { tokenHash, scope: "write" });
    const tokenReq = await app.request(
      "/api/tokens",
      { method: "GET", headers: { Authorization: "Bearer ig_owner_only_check" } },
      testEnv(),
    );
    expect(tokenReq.status).toBe(403);

    const jwt = await signAccessJwt({ email: OWNER_EMAIL });
    const ownerReq = await app.request(
      "/api/tokens",
      { method: "GET", headers: { "Cf-Access-Jwt-Assertion": jwt } },
      testEnv(),
    );
    expect(ownerReq.status).toBe(200);
  });
});
