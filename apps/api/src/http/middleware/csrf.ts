import { createMiddleware } from "hono/factory";
import { readCookie } from "../../lib/cookies";
import { AppError } from "../../lib/errors";
import type { AppEnv } from "../types";
import { originAllowed } from "./cors";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CLIENT_HEADER = "X-Garden-Client";
const ACCESS_COOKIE = "CF_Authorization";

/**
 * CSRF guard for unsafe methods (POST/PUT/PATCH/DELETE) on `/api/*`.
 *
 * Only ambient-credential writes need it. Guarded when either:
 *   - the actor is the owner authenticated via Access, header or cookie —
 *     both are treated the same for defense in depth; or
 *   - the local dev bypass is off and the request carries a
 *     `CF_Authorization` cookie at all, even one that failed verification —
 *     a browser attaches that cookie automatically regardless of whether it
 *     happens to still be valid, so its mere presence is the CSRF signal.
 * A bearer token is never ambient (the caller must know and explicitly
 * attach it), so token actors are always exempt, and so is the local dev
 * bypass (no real credential involved).
 *
 * When guarded, both must hold:
 *   - `Origin` exactly matches an entry in `CORS_ORIGINS` (the same
 *     allowlist the CORS middleware uses); a missing or literal `"null"`
 *     Origin is rejected.
 *   - `X-Garden-Client` is present. It is not a CORS-safelisted header, so a
 *     cross-site form or no-cors fetch cannot attach it — only a request
 *     that already survived a CORS preflight against `CORS_ORIGINS` can.
 *
 * On failure: `403 forbidden` via the standard error envelope, no
 * internals. Safe methods (GET/HEAD/OPTIONS) are never touched.
 */
export function createCsrfMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!UNSAFE_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    const actor = c.get("actor");
    if (actor.type === "token") {
      await next();
      return;
    }

    const cookiePresent = readCookie(c.req.header("Cookie"), ACCESS_COOKIE) !== null;
    const devBypassOff = c.env.DEV_OWNER_BYPASS !== "true";
    const accessAuthenticated = actor.type === "owner" && actor.via === "access";
    const guarded = accessAuthenticated || (devBypassOff && cookiePresent);

    if (!guarded) {
      await next();
      return;
    }

    const origin = c.req.header("Origin");
    const allowlist = (c.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const originOk = origin != null && origin !== "null" && originAllowed(origin, allowlist);
    const clientHeaderOk = !!c.req.header(CLIENT_HEADER);

    if (!originOk || !clientHeaderOk) {
      throw AppError.forbidden("csrf check failed");
    }

    await next();
  });
}
