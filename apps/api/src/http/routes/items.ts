import {
  createItemInputSchema,
  itemListQuerySchema,
  scopeSatisfies,
  updateItemInputSchema,
} from "@garden/shared";
import type { Hono } from "hono";
import { createDb } from "../../db/client";
import { ItemsRepository } from "../../db/repositories/items-repository";
import { AppError } from "../../lib/errors";
import { actorLabel, computeItemSource } from "../actor-label";
import { requireAuth } from "../middleware/require";
import type { Actor, AppEnv } from "../types";

function canSeeDeleted(actor: Actor): boolean {
  return actor.type === "owner" || (actor.type === "token" && scopeSatisfies(actor.scope, "write"));
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw AppError.badRequest("invalid_body", "request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

export function registerItemRoutes(app: Hono<AppEnv>): void {
  app.get("/api/items", async (c) => {
    const raw = {
      kind: c.req.queries("kind"),
      tag: c.req.queries("tag"),
      categoryId: c.req.queries("categoryId"),
      color: c.req.query("color"),
      q: c.req.query("q"),
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit"),
      includeDeleted: c.req.query("includeDeleted"),
    };
    const parsed = itemListQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw AppError.badRequest("invalid_query", "invalid query parameters", parsed.error.issues);
    }
    const query = parsed.data;

    if (query.includeDeleted && !canSeeDeleted(c.get("actor"))) {
      throw AppError.forbidden("includeDeleted requires owner or write-scope access");
    }

    const repo = new ItemsRepository(createDb(c.env.DB));
    const result = await repo.list(query);
    return c.json(result);
  });

  app.get("/api/items/:id", async (c) => {
    const repo = new ItemsRepository(createDb(c.env.DB));
    const item = await repo.getById(c.req.param("id"), canSeeDeleted(c.get("actor")));
    if (!item) throw AppError.notFound("item not found");
    return c.json(item);
  });

  app.get("/api/items/:id/revisions", requireAuth("write"), async (c) => {
    const repo = new ItemsRepository(createDb(c.env.DB));
    const revisions = await repo.listRevisions(c.req.param("id"));
    return c.json({ revisions });
  });

  app.post("/api/items", requireAuth("write"), async (c) => {
    const rawBody = await parseJsonBody(c.req.raw);
    const actor = c.get("actor");
    const body = {
      ...rawBody,
      source: computeItemSource(actor, rawBody.source, c.req.header("X-Garden-Client")),
    };
    const parsed = createItemInputSchema.safeParse(body);
    if (!parsed.success)
      throw AppError.badRequest("invalid_body", "invalid item payload", parsed.error.issues);

    const repo = new ItemsRepository(createDb(c.env.DB));
    const item = await repo.create(parsed.data, actorLabel(actor));
    return c.json(item, 201);
  });

  app.patch("/api/items/:id", requireAuth("write"), async (c) => {
    const rawBody = await parseJsonBody(c.req.raw);
    delete rawBody.source; // source is set once at creation and immutable via PATCH
    const parsed = updateItemInputSchema.safeParse(rawBody);
    if (!parsed.success)
      throw AppError.badRequest("invalid_body", "invalid item payload", parsed.error.issues);

    const repo = new ItemsRepository(createDb(c.env.DB));
    const item = await repo.update(c.req.param("id"), parsed.data, actorLabel(c.get("actor")));
    return c.json(item);
  });

  app.delete("/api/items/:id", requireAuth("write"), async (c) => {
    const repo = new ItemsRepository(createDb(c.env.DB));
    const item = await repo.softDelete(c.req.param("id"), actorLabel(c.get("actor")));
    return c.json(item);
  });

  app.post("/api/items/:id/restore", requireAuth("write"), async (c) => {
    const repo = new ItemsRepository(createDb(c.env.DB));
    const item = await repo.restore(c.req.param("id"), actorLabel(c.get("actor")));
    return c.json(item);
  });

  app.post("/api/items/:id/revisions/:revId/restore", requireAuth("write"), async (c) => {
    const repo = new ItemsRepository(createDb(c.env.DB));
    const item = await repo.restoreRevision(
      c.req.param("id"),
      c.req.param("revId"),
      actorLabel(c.get("actor")),
    );
    return c.json(item);
  });
}
