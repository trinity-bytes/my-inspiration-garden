import { Hono } from "hono";
import { AppError, errorBody } from "../lib/errors";
import { createActorMiddleware } from "./middleware/actor";
import { createCorsMiddleware } from "./middleware/cors";
import { registerAuthRoutes } from "./routes/auth";
import { registerCategoryRoutes } from "./routes/categories";
import { registerItemRoutes } from "./routes/items";
import { registerMediaRoutes } from "./routes/media";
import { registerSessionRoutes } from "./routes/session";
import { registerTagRoutes } from "./routes/tags";
import { registerTokenRoutes } from "./routes/tokens";
import { registerUnfurlRoutes } from "./routes/unfurl";
import type { AppDeps, AppEnv } from "./types";

/** Builds the Hono app. `deps` lets tests inject a fake `verifyAccessJwt` (no network JWKS calls). */
export function createApp(deps: AppDeps = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", createCorsMiddleware());
  app.use("*", createActorMiddleware(deps));

  app.get("/api/health", (c) => c.json({ ok: true }));

  registerSessionRoutes(app);
  registerAuthRoutes(app);
  registerItemRoutes(app);
  registerCategoryRoutes(app);
  registerTagRoutes(app);
  registerTokenRoutes(app);
  registerMediaRoutes(app, deps);
  registerUnfurlRoutes(app, deps);

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(errorBody(err), err.status as Parameters<typeof c.json>[1]);
    }
    console.error(err);
    return c.json(errorBody(new AppError(500, "internal_error", "unexpected server error")), 500);
  });

  app.notFound((c) => c.json(errorBody(AppError.notFound("no such route")), 404));

  return app;
}
