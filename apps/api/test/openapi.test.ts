import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";
import { honoPathToOpenApiPath } from "../src/http/openapi";
import { testVerifyAccessJwt } from "./access-jwt-fixture";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const app = createApp({ verifyAccessJwt: testVerifyAccessJwt });

function testEnv() {
  return { ...env, OWNER_EMAIL: "owner@test.dev" };
}

interface OpenApiDoc {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components?: { securitySchemes?: Record<string, unknown> };
}

describe("GET /api/openapi.json", () => {
  it("is public and returns a cacheable, valid-looking OpenAPI 3.1 document", async () => {
    const res = await app.request("/api/openapi.json", {}, testEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/public/);

    const doc = await res.json<OpenApiDoc>();
    expect(doc.openapi.startsWith("3.1")).toBe(true);
    expect(doc.info.title).toBeTruthy();
    expect(Object.keys(doc.paths).length).toBeGreaterThan(10);
    expect(doc.components?.securitySchemes?.bearerAuth).toBeDefined();
  });

  it("documents the bearer scope semantics (write implies read)", async () => {
    const res = await app.request("/api/openapi.json", {}, testEnv());
    const doc = await res.json<OpenApiDoc>();
    const bearerAuth = doc.components?.securitySchemes?.bearerAuth as { description?: string };
    expect(bearerAuth.description ?? "").toMatch(/write.*implies.*read/i);
  });

  it("has no route registered in the app that is missing from the document (drift guard)", async () => {
    const res = await app.request("/api/openapi.json", {}, testEnv());
    const doc = await res.json<OpenApiDoc>();

    // biome-ignore lint/suspicious/noExplicitAny: Hono's public `routes` introspection array has no exported element type name.
    const registered = (app as any).routes as { method: string; path: string }[];
    const apiRoutes = registered.filter(
      (route) => route.method !== "ALL" && route.path.startsWith("/api"),
    );
    expect(apiRoutes.length).toBeGreaterThan(10);

    for (const route of apiRoutes) {
      const openApiPath = honoPathToOpenApiPath(route.path);
      const method = route.method.toLowerCase();
      const pathItem = doc.paths[openApiPath];
      expect(pathItem, `missing path ${openApiPath} for ${route.method}`).toBeDefined();
      expect(
        pathItem?.[method],
        `missing ${route.method} ${openApiPath} in openapi document`,
      ).toBeDefined();
    }
  });
});
