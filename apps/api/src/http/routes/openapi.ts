import type { Hono } from "hono";
import { buildOpenApiDocument } from "../openapi";
import type { AppEnv } from "../types";

/** `GET /api/openapi.json` — public, cacheable OpenAPI 3.1 document for agents. */
export function registerOpenApiRoutes(app: Hono<AppEnv>): void {
  app.get("/api/openapi.json", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(buildOpenApiDocument());
  });
}
