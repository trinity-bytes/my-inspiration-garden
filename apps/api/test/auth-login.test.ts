import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const app = createApp();

describe("GET /auth/login", () => {
  it("redirects to / with a 302", async () => {
    const res = await app.request("/auth/login", { redirect: "manual" }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("ignores a next query param — never an open redirect", async () => {
    const res = await app.request(
      "/auth/login?next=https://evil.example.com",
      { redirect: "manual" },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("ignores a next param that tries a protocol-relative redirect", async () => {
    const res = await app.request("/auth/login?next=//evil.example.com", { redirect: "manual" }, env);
    expect(res.headers.get("Location")).toBe("/");
  });
});
