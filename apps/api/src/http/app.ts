import { Hono } from "hono";
import { findDeployConfigProblems } from "../config/deploy-config";
import { AppError, errorBody } from "../lib/errors";
import { createActorMiddleware } from "./middleware/actor";
import { createCorsMiddleware } from "./middleware/cors";
import { createCsrfMiddleware } from "./middleware/csrf";
import { registerAuthRoutes } from "./routes/auth";
import { registerCategoryRoutes } from "./routes/categories";
import { registerItemRoutes } from "./routes/items";
import { registerMediaRoutes } from "./routes/media";
import { registerOpenApiRoutes } from "./routes/openapi";
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
  app.use("/api/*", createCsrfMiddleware());

  app.get("/api/health", (c) => {
    // Reports placeholder values that survived from wrangler.jsonc into a real
    // deploy. Computed per request, never at module scope, so a bad
    // config can never stop the Worker from starting. Deliberately still
    // HTTP 200: a misconfigured value is not a server fault, and a 503 would
    // read as "the Worker is down" rather than "the Worker is misconfigured".
    const problems = findDeployConfigProblems(c.env);
    return c.json({ ok: problems.length === 0, config: { problems } });
  });

  registerSessionRoutes(app);
  registerAuthRoutes(app);
  registerItemRoutes(app, deps);
  registerCategoryRoutes(app);
  registerTagRoutes(app);
  registerTokenRoutes(app);
  registerMediaRoutes(app, deps);
  registerUnfurlRoutes(app, deps);
  registerOpenApiRoutes(app);

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
