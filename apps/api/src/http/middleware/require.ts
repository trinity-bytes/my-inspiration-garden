import { scopeSatisfies, type TokenScope } from "@garden/shared";
import { createMiddleware } from "hono/factory";
import { AppError } from "../../lib/errors";
import type { AppEnv } from "../types";

/** Requires the owner, or a token whose scope satisfies `minScope`. */
export function requireAuth(minScope: TokenScope) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const actor = c.get("actor");
    if (actor.type === "owner") {
      await next();
      return;
    }
    if (actor.type === "token") {
      if (scopeSatisfies(actor.scope, minScope)) {
        await next();
        return;
      }
      throw AppError.forbidden("token scope does not allow this operation");
    }
    throw AppError.unauthorized();
  });
}

/** Requires the authenticated owner (Access JWT or dev bypass) — tokens never qualify. */
export function requireOwner() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const actor = c.get("actor");
    if (actor.type === "owner") {
      await next();
      return;
    }
    if (actor.type === "token") throw AppError.forbidden("owner access required");
    throw AppError.unauthorized();
  });
}
