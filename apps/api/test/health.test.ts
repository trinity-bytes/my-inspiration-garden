import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";

/** A correctly configured deployment: no value is a placeholder. */
const CONFIGURED_ENV = {
  ...env,
  ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  ACCESS_AUD: "9f8e7d6c5b4a39281706f5e4d3c2b1a0",
  OWNER_EMAIL: "owner@real-domain.dev",
  CORS_ORIGINS: "https://garden.example.com",
  DEV_OWNER_BYPASS: "false",
};

/** The exact values `apps/api/wrangler.jsonc` ships today. */
const SHIPPED_ENV = {
  ...env,
  ACCESS_TEAM_DOMAIN: "your-team.cloudflareaccess.com",
  ACCESS_AUD: "REPLACE_WITH_ACCESS_AUD",
  OWNER_EMAIL: "owner@example.com",
  CORS_ORIGINS: "http://localhost:5173",
  DEV_OWNER_BYPASS: "false",
};

const app = createApp();

interface HealthBody {
  ok: boolean;
  config: { problems: { id: string; message: string }[] };
}

describe("GET /api/health", () => {
  it("reports ok for a correctly configured deployment", async () => {
    const res = await app.request("/api/health", {}, CONFIGURED_ENV);

    expect(res.status).toBe(200);
    await expect(res.json<HealthBody>()).resolves.toEqual({ ok: true, config: { problems: [] } });
  });

  it("reports ok: false and names the placeholders that survived into a deploy", async () => {
    const res = await app.request("/api/health", {}, SHIPPED_ENV);
    const body = await res.json<HealthBody>();

    // Still HTTP 200: a misconfigured value is not a server fault, and a 503
    // here would make the Worker look down rather than misconfigured.
    expect(res.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.config.problems.map((problem) => problem.id).sort()).toEqual([
      "ACCESS_AUD",
      "ACCESS_TEAM_DOMAIN",
      "CORS_ORIGINS",
      "OWNER_EMAIL",
    ]);
  });

  it("needs no owner credential, so any visitor can read the report", async () => {
    // No Cookie and no Authorization header: `/api/health` must stay public,
    // because a deploy check that 403s cannot report a broken deploy.
    const res = await app.request("/api/health", {}, CONFIGURED_ENV);
    const body = await res.json<HealthBody>();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, config: { problems: [] } });
  });

  it("answers through the real Worker entry with the documented shape", async () => {
    // Contract only, never values: the values here come straight from
    // wrangler.jsonc, and asserting them would make this test fail the moment
    // the owner does the correct thing and fills the placeholders in.
    const response = await SELF.fetch("https://example.com/api/health");
    const body = (await response.json()) as HealthBody;

    expect(response.status).toBe(200);
    expect(typeof body.ok).toBe("boolean");
    expect(Array.isArray(body.config.problems)).toBe(true);
    for (const problem of body.config.problems) {
      expect(typeof problem.id).toBe("string");
      expect(typeof problem.message).toBe("string");
    }
  });
});
