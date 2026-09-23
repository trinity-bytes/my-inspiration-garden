import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";
import { hashHex, insertApiToken } from "./helpers";
import { signAccessJwt, TEST_AUD, testVerifyAccessJwt } from "./access-jwt-fixture";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const OWNER_EMAIL = "owner-session@test.dev";
const app = createApp({ verifyAccessJwt: testVerifyAccessJwt });

function testEnv(overrides: Record<string, string> = {}) {
  return {
    ...env,
    OWNER_EMAIL,
    ACCESS_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
    ACCESS_AUD: TEST_AUD,
    ...overrides,
  };
}

describe("GET /api/session", () => {
  it("reports visitor for an anonymous request", async () => {
    const res = await app.request("/api/session", {}, testEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "visitor" });
  });

  it("reports owner for a valid owner cookie", async () => {
    const jwt = await signAccessJwt({ email: OWNER_EMAIL });
    const res = await app.request(
      "/api/session",
      { headers: { Cookie: `CF_Authorization=${jwt}` } },
      testEnv(),
    );
    expect(await res.json()).toEqual({ role: "owner" });
  });

  it("reports owner for a valid owner header", async () => {
    const jwt = await signAccessJwt({ email: OWNER_EMAIL });
    const res = await app.request(
      "/api/session",
      { headers: { "Cf-Access-Jwt-Assertion": jwt } },
      testEnv(),
    );
    expect(await res.json()).toEqual({ role: "owner" });
  });

  it("reports visitor for a valid write-scope bearer token (this endpoint is about the browser owner session)", async () => {
    const tokenHash = await hashHex("ig_session_probe");
    await insertApiToken("session-probe", { tokenHash, scope: "write" });
    const res = await app.request(
      "/api/session",
      { headers: { Authorization: "Bearer ig_session_probe" } },
      testEnv(),
    );
    expect(await res.json()).toEqual({ role: "visitor" });
  });

  it("never returns the owner email or any token data", async () => {
    const jwt = await signAccessJwt({ email: OWNER_EMAIL });
    const res = await app.request(
      "/api/session",
      { headers: { Cookie: `CF_Authorization=${jwt}` } },
      testEnv(),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["role"]);
  });

  it("sets Cache-Control: no-store and Vary on Cookie and Cf-Access-Jwt-Assertion", async () => {
    const res = await app.request("/api/session", {}, testEnv());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const vary = res.headers.get("Vary");
    expect(vary).toContain("Cookie");
    expect(vary).toContain("Cf-Access-Jwt-Assertion");
  });
});
