import { createApiTokenInputSchema } from "@garden/shared";
import type { Hono } from "hono";
import { createDb } from "../../db/client";
import { TokensRepository } from "../../db/repositories/tokens-repository";
import { AppError } from "../../lib/errors";
import { requireOwner } from "../middleware/require";
import type { AppEnv } from "../types";

export function registerTokenRoutes(app: Hono<AppEnv>): void {
  app.post("/api/tokens", requireOwner(), async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = createApiTokenInputSchema.safeParse(body);
    if (!parsed.success)
      throw AppError.badRequest("invalid_body", "invalid token payload", parsed.error.issues);
    const repo = new TokensRepository(createDb(c.env.DB));
    const created = await repo.create(parsed.data);
    return c.json(created, 201);
  });

  app.get("/api/tokens", requireOwner(), async (c) => {
    const repo = new TokensRepository(createDb(c.env.DB));
    return c.json({ tokens: await repo.list() });
  });

  app.delete("/api/tokens/:id", requireOwner(), async (c) => {
    const repo = new TokensRepository(createDb(c.env.DB));
    await repo.revoke(c.req.param("id"));
    return c.body(null, 204);
  });
}
