import type { Hono } from "hono";
import type { AppEnv } from "../types";

/**
 * `GET /auth/login` — the only route Cloudflare Access protects (configured
 * in the Cloudflare dashboard, not in code; see `docs/api.md`). By the time
 * a request reaches this handler, Access has already authenticated the
 * owner and set the `CF_Authorization` session cookie in the browser; this
 * handler's only job is to send the browser back into the app. Always
 * redirects to `/` — no redirect target is ever read from the request, so
 * there is nothing here for an open-redirect attack to target.
 */
export function registerAuthRoutes(app: Hono<AppEnv>): void {
  app.get("/auth/login", (c) => c.redirect("/", 302));
}
