import type { Hono } from "hono";
import type { AppEnv } from "../types";

/**
 * `GET /api/session` — public, cookie/header-aware "who am I" probe for the
 * browser's own owner session. Returns positive proof only: `role: "owner"`
 * exactly when the resolved actor is the owner (Access session or the local
 * dev bypass), `"visitor"` otherwise — including for a request carrying a
 * valid bearer token, since this endpoint answers "is this browser the
 * owner", not "is this request authorized to write" (a token client never
 * needs this endpoint; it already knows its own scope). Never returns the
 * owner email, a token, or any other credential data. Always `no-store` and
 * varies on both possible credential sources so no shared/browser cache
 * ever serves one visitor's session state to another.
 */
export function registerSessionRoutes(app: Hono<AppEnv>): void {
  app.get("/api/session", (c) => {
    const actor = c.get("actor");
    const role = actor.type === "owner" ? "owner" : "visitor";
    c.header("Cache-Control", "no-store");
    c.header("Vary", "Cookie, Cf-Access-Jwt-Assertion");
    return c.json({ role });
  });
}
