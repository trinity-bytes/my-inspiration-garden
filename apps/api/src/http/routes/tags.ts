import type { Hono } from "hono";
import { z } from "zod";
import { createDb } from "../../db/client";
import { TagsRepository } from "../../db/repositories/tags-repository";
import { AppError } from "../../lib/errors";
import { requireAuth } from "../middleware/require";
import type { AppEnv } from "../types";

export const renameTagInputSchema = z.object({ name: z.string().trim().min(1) });

export function registerTagRoutes(app: Hono<AppEnv>): void {
  app.get("/api/tags", async (c) => {
    const repo = new TagsRepository(createDb(c.env.DB));
    return c.json({ tags: await repo.listWithCounts() });
  });

  app.patch("/api/tags/:id", requireAuth("write"), async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = renameTagInputSchema.safeParse(body);
    if (!parsed.success)
      throw AppError.badRequest("invalid_body", "invalid tag payload", parsed.error.issues);
    const repo = new TagsRepository(createDb(c.env.DB));
    const tag = await repo.rename(c.req.param("id"), parsed.data.name);
    return c.json(tag);
  });

  app.delete("/api/tags/:id", requireAuth("write"), async (c) => {
    const repo = new TagsRepository(createDb(c.env.DB));
    await repo.delete(c.req.param("id"));
    return c.body(null, 204);
  });
}
