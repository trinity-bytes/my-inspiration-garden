import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/**
 * Matches an allowlist entry against a request `Origin`. Entries ending in
 * `*` (e.g. `chrome-extension://*`, `moz-extension://*`) match any suffix;
 * every other entry must match exactly. `CORS_ORIGINS` is a comma-separated
 * list of such entries.
 */
export function originAllowed(origin: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => {
    if (entry.endsWith("*")) return origin.startsWith(entry.slice(0, -1));
    return entry === origin;
  });
}

/**
 * Reflects the request `Origin` back (with the usual CORS headers) when it
 * matches `CORS_ORIGINS`. Same-origin topology: the web app and the API
 * share one hostname, so the owner's Access session cookie is same-origin
 * and never needs credentialed CORS — `Access-Control-Allow-Credentials` is
 * intentionally never sent. Cross-origin clients (extension, PWA, agents)
 * authenticate with a bearer token instead of a cookie, so they don't need
 * it either. `X-Garden-Client` stays an allowed request header for both;
 * the CSRF guard (`./csrf.ts`) reuses `CORS_ORIGINS` as its own allowlist.
 */
export function createCorsMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const origin = c.req.header("Origin");
    const allowlist = (c.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    const allowed = origin ? originAllowed(origin, allowlist) : false;

    if (c.req.method === "OPTIONS") {
      const headers = new Headers();
      if (allowed && origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Vary", "Origin");
        headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
        headers.set(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, Cf-Access-Jwt-Assertion, X-Garden-Client",
        );
      }
      c.res = new Response(null, { status: 204, headers });
      return;
    }

    await next();

    if (allowed && origin) {
      c.res.headers.set("Access-Control-Allow-Origin", origin);
      c.res.headers.set("Vary", "Origin");
    }
  });
}
