import { createCategoryInputSchema, updateCategoryInputSchema } from "@garden/shared";
import type { Hono } from "hono";
import { createDb } from "../../db/client";
import { CategoriesRepository } from "../../db/repositories/categories-repository";
import { AppError } from "../../lib/errors";
import { requireAuth } from "../middleware/require";
import type { AppEnv } from "../types";

export function registerCategoryRoutes(app: Hono<AppEnv>): void {
  app.get("/api/categories", async (c) => {
    const repo = new CategoriesRepository(createDb(c.env.DB));
    return c.json({ categories: await repo.list() });
  });

  app.post("/api/categories", requireAuth("write"), async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = createCategoryInputSchema.safeParse(body);
    if (!parsed.success)
      throw AppError.badRequest("invalid_body", "invalid category payload", parsed.error.issues);
    const repo = new CategoriesRepository(createDb(c.env.DB));
    const category = await repo.create(parsed.data);
    return c.json(category, 201);
  });

  app.patch("/api/categories/:id", requireAuth("write"), async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = updateCategoryInputSchema.safeParse(body);
    if (!parsed.success)
      throw AppError.badRequest("invalid_body", "invalid category payload", parsed.error.issues);
    const repo = new CategoriesRepository(createDb(c.env.DB));
    const category = await repo.update(c.req.param("id"), parsed.data);
    return c.json(category);
  });

  app.delete("/api/categories/:id", requireAuth("write"), async (c) => {
    const repo = new CategoriesRepository(createDb(c.env.DB));
    await repo.delete(c.req.param("id"));
    return c.body(null, 204);
  });
}
