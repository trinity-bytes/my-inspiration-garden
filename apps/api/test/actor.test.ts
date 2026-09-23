import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createActorMiddleware } from "../src/http/middleware/actor";
import type { AppEnv } from "../src/http/types";
import { signAccessJwt, TEST_AUD, testVerifyAccessJwt } from "./access-jwt-fixture";

const OWNER_EMAIL = "owner@test.dev";
const TEAM_DOMAIN = "test-team.cloudflareaccess.com";

function buildTestApp() {
  const app = new Hono<AppEnv>();
  app.use("*", createActorMiddleware({ verifyAccessJwt: testVerifyAccessJwt }));
  app.get("/whoami", (c) => c.json(c.get("actor")));
  return app;
}

function testEnv(overrides: Record<string, string> = {}) {
  return {
    OWNER_EMAIL,
    ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
    ACCESS_AUD: TEST_AUD,
    ...overrides,
  } as unknown as AppEnv["Bindings"];
}

async function whoami(headers: Record<string, string>, envOverrides: Record<string, string> = {}) {
  const app = buildTestApp();
  const res = await app.request("/whoami", { headers }, testEnv(envOverrides));
  return res.json();
}

describe("actor resolution — Access JWT source", () => {
  it("resolves owner from a valid cookie-only JWT (no header)", async () => {
    const jwt = await signAccessJwt({ email: OWNER_EMAIL });
    const body = await whoami({ Cookie: `CF_Authorization=${jwt}` });
    expect(body).toEqual({ type: "owner", via: "access", credential: "cookie" });
  });

  it("prefers the header over the cookie when both are present", async () => {
    const headerJwt = await signAccessJwt({ email: OWNER_EMAIL });
    // A cookie present at the same time, even a valid-owner one, must be ignored.
    const cookieJwt = await signAccessJwt({ email: OWNER_EMAIL }, { audience: "wrong-aud" });
    const body = await whoami({
      "Cf-Access-Jwt-Assertion": headerJwt,
      Cookie: `CF_Authorization=${cookieJwt}`,
    });
    expect(body).toEqual({ type: "owner", via: "access", credential: "header" });
  });

  it("stays anonymous for a malformed Cookie header", async () => {
    const body = await whoami({ Cookie: "garbage;;;===nope" });
    expect(body).toEqual({ type: "anonymous" });
  });

  it("stays anonymous for an expired cookie JWT", async () => {
    const jwt = await signAccessJwt({ email: OWNER_EMAIL }, { expiresInSeconds: -10 });
    const body = await whoami({ Cookie: `CF_Authorization=${jwt}` });
    expect(body).toEqual({ type: "anonymous" });
  });

  it("stays anonymous for a cookie JWT with the wrong audience", async () => {
    const jwt = await signAccessJwt({ email: OWNER_EMAIL }, { audience: "wrong-aud" });
    const body = await whoami({ Cookie: `CF_Authorization=${jwt}` });
    expect(body).toEqual({ type: "anonymous" });
  });

  it("stays anonymous for a cookie JWT with the wrong issuer", async () => {
    const jwt = await signAccessJwt(
      { email: OWNER_EMAIL },
      { issuer: "https://someone-elses-team.cloudflareaccess.com" },
    );
    const body = await whoami({ Cookie: `CF_Authorization=${jwt}` });
    expect(body).toEqual({ type: "anonymous" });
  });

  it("stays anonymous for a cookie JWT belonging to a non-owner email", async () => {
    const jwt = await signAccessJwt({ email: "someone-else@test.dev" });
    const body = await whoami({ Cookie: `CF_Authorization=${jwt}` });
    expect(body).toEqual({ type: "anonymous" });
  });

  it("stays anonymous with no credentials at all", async () => {
    const body = await whoami({});
    expect(body).toEqual({ type: "anonymous" });
  });
});
