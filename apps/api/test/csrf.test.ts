import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";
import { signAccessJwt, TEST_AUD, testVerifyAccessJwt } from "./access-jwt-fixture";
import { hashHex, insertApiToken } from "./helpers";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const OWNER_EMAIL = "owner-csrf@test.dev";
const ALLOWED_ORIGIN = "http://localhost:5173";
const app = createApp({ verifyAccessJwt: testVerifyAccessJwt });

function testEnv(overrides: Record<string, string> = {}) {
  return {
    ...env,
    OWNER_EMAIL,
    ACCESS_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
    ACCESS_AUD: TEST_AUD,
    CORS_ORIGINS: ALLOWED_ORIGIN,
    ...overrides,
  };
}

const validBody = JSON.stringify({ kind: "text", source: "web", data: { body: "csrf" } });

async function postItemAsOwner(
  extraHeaders: Record<string, string>,
  credential: "header" | "cookie" = "cookie",
  envOverrides: Record<string, string> = {},
) {
  const jwt = await signAccessJwt({ email: OWNER_EMAIL });
  const credentialHeader: Record<string, string> =
    credential === "header"
      ? { "Cf-Access-Jwt-Assertion": jwt }
      : { Cookie: `CF_Authorization=${jwt}` };
  return app.request(
    "/api/items",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...credentialHeader, ...extraHeaders },
      body: validBody,
    },
    testEnv(envOverrides),
  );
}

describe("CSRF guard — owner writes authenticated via Access (cookie)", () => {
  it("403s without an Origin header", async () => {
    const res = await postItemAsOwner({ "X-Garden-Client": "web" });
    expect(res.status).toBe(403);
  });

  it("403s with a mismatched Origin", async () => {
    const res = await postItemAsOwner({
      Origin: "https://evil.example.com",
      "X-Garden-Client": "web",
    });
    expect(res.status).toBe(403);
  });

  it("403s with Origin: null", async () => {
    const res = await postItemAsOwner({ Origin: "null", "X-Garden-Client": "web" });
    expect(res.status).toBe(403);
  });

  it("403s without the X-Garden-Client header", async () => {
    const res = await postItemAsOwner({ Origin: ALLOWED_ORIGIN });
    expect(res.status).toBe(403);
  });

  it("passes through to the handler with a matching Origin and X-Garden-Client", async () => {
    const res = await postItemAsOwner({ Origin: ALLOWED_ORIGIN, "X-Garden-Client": "web" });
    expect(res.status).toBe(201);
  });
});

describe("CSRF guard — owner writes authenticated via Access (header)", () => {
  it("403s without an Origin header", async () => {
    const res = await postItemAsOwner({ "X-Garden-Client": "web" }, "header");
    expect(res.status).toBe(403);
  });

  it("passes through with a matching Origin and X-Garden-Client", async () => {
    const res = await postItemAsOwner(
      { Origin: ALLOWED_ORIGIN, "X-Garden-Client": "web" },
      "header",
    );
    expect(res.status).toBe(201);
  });
});

describe("CSRF guard — exemptions and unaffected traffic", () => {
  it("does not block a bearer-token write with no Origin header", async () => {
    const tokenHash = await hashHex("ig_csrf_token");
    await insertApiToken("csrf-token", { tokenHash, scope: "write" });
    const res = await app.request(
      "/api/items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer ig_csrf_token" },
        body: validBody,
      },
      testEnv(),
    );
    expect(res.status).toBe(201);
  });

  it("does not block a GET request even for an owner cookie session with no Origin", async () => {
    const jwt = await signAccessJwt({ email: OWNER_EMAIL });
    const res = await app.request(
      "/api/items",
      { headers: { Cookie: `CF_Authorization=${jwt}` } },
      testEnv(),
    );
    expect(res.status).toBe(200);
  });

  it("does not block a dev-bypass owner write with no Origin (local dev)", async () => {
    const res = await app.request(
      "/api/items",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: validBody },
      testEnv({ DEV_OWNER_BYPASS: "true" }),
    );
    expect(res.status).toBe(201);
  });

  it("does not block a dev-bypass owner write even with a CF_Authorization cookie present and no Origin", async () => {
    const res = await app.request(
      "/api/items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: "CF_Authorization=whatever" },
        body: validBody,
      },
      testEnv({ DEV_OWNER_BYPASS: "true" }),
    );
    expect(res.status).toBe(201);
  });
});
