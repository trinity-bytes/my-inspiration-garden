import { createMiddleware } from "hono/factory";
import { createDb } from "../../db/client";
import { TokensRepository } from "../../db/repositories/tokens-repository";
import { defaultVerifyAccessJwt } from "../auth/access-jwt";
import type { Actor, AppDeps, AppEnv } from "../types";

const CLIENT_HEADER = "X-Garden-Client";

function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

/**
 * Resolves the request's `actor` (anonymous | owner | scoped token) and
 * stores it on the context. Resolution order:
 *   1. `DEV_OWNER_BYPASS === "true"` (local-only escape hatch; must only be
 *      set in `.dev.vars`, never in `wrangler.jsonc` vars) — treats every
 *      request as the owner.
 *   2. `Authorization: Bearer <token>` — looked up by its SHA-256 hash
 *      against `api_tokens`; revoked or unknown tokens fall through to
 *      anonymous (no partial credit for a bad token).
 *   3. `Cf-Access-Jwt-Assertion` — verified against Cloudflare Access's JWKS
 *      (or the injected `verifyAccessJwt` in tests); only the configured
 *      `OWNER_EMAIL` becomes the owner actor.
 * This middleware never rejects a request itself — it only sets `actor`;
 * `requireAuth`/`requireOwner` enforce access.
 */
export function createActorMiddleware(deps: AppDeps = {}) {
  const verifyAccessJwt = deps.verifyAccessJwt ?? defaultVerifyAccessJwt;

  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.env.DEV_OWNER_BYPASS === "true") {
      c.set("actor", { type: "owner", via: "dev-bypass" });
      await next();
      return;
    }

    let actor: Actor = { type: "anonymous" };

    const bearer = readBearerToken(c.req.header("Authorization"));
    if (bearer) {
      const tokensRepo = new TokensRepository(createDb(c.env.DB));
      const found = await tokensRepo.findActiveByPlaintext(bearer);
      if (found) {
        const client = c.req.header(CLIENT_HEADER);
        actor = {
          type: "token",
          tokenId: found.id,
          name: found.name,
          scope: found.scope,
          client: client === "extension" || client === "pwa" ? client : undefined,
        };
        await tokensRepo.touchLastUsed(found.id);
      }
    }

    const accessJwt = c.req.header("Cf-Access-Jwt-Assertion");
    if (actor.type === "anonymous" && accessJwt) {
      try {
        const payload = await verifyAccessJwt(accessJwt, {
          ACCESS_TEAM_DOMAIN: c.env.ACCESS_TEAM_DOMAIN,
          ACCESS_AUD: c.env.ACCESS_AUD,
        });
        const email = (payload as { email?: string }).email;
        if (c.env.OWNER_EMAIL && email === c.env.OWNER_EMAIL) {
          actor = { type: "owner", via: "access" };
        }
      } catch {
        // invalid/expired JWT: stay anonymous
      }
    }

    c.set("actor", actor);
    await next();
  });
}
