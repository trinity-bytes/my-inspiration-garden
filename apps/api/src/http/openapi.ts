import {
  apiTokenPublicSchema,
  categorySchema,
  createApiTokenInputSchema,
  createCategoryInputSchema,
  createItemInputSchema,
  hexColorSchema,
  idSchema,
  itemKindSchema,
  itemSchema,
  linkPlatformSchema,
  SCHEMA_VERSION,
  updateCategoryInputSchema,
  updateItemInputSchema,
} from "@garden/shared";
import { z } from "zod";
import { renameTagInputSchema } from "./routes/tags";

/**
 * OpenAPI 3.1 document generator for agents (T12). Every request/response
 * body schema below is generated from the same shared Zod schemas the API
 * itself validates against, via Zod 4's native `z.toJSONSchema` — nothing is
 * hand-duplicated for the pieces that already have a shared schema. A few
 * response/request shapes have no shared Zod schema today (media, unfurl,
 * tags, session, the error envelope) and get small doc-only schemas defined
 * in this file instead of a second real runtime schema.
 *
 * `honoPathToOpenApiPath` is the single source of truth for converting a
 * Hono route path (`:id`, trailing `*`) into an OpenAPI path template
 * (`{id}`, `{key}`); the completeness test (`test/openapi.test.ts`) imports
 * the same function to compare `app.routes` against `document.paths`, so the
 * two can never drift apart from each other by construction.
 */

// biome-ignore lint/suspicious/noExplicitAny: z.toJSONSchema's return type is a broad JSON Schema union; callers only ever embed it verbatim.
type JsonSchema = Record<string, any>;

/**
 * `io: "input"` documents the *accepted* shape for schemas built with
 * `.transform()`/`.pipe()` (e.g. the shared `tagsSchema`, which normalizes
 * tags but still accepts/returns a plain string array) instead of throwing —
 * `z.toJSONSchema`'s default ("output") mode rejects any transform outright.
 * `unrepresentable: "any"` is a safety net for anything else that still
 * isn't representable, so a schema change elsewhere can never crash doc
 * generation (or, prior to lazy building below, Worker startup itself).
 */
function schemaOf(zodSchema: z.core.$ZodType): JsonSchema {
  return z.toJSONSchema(zodSchema, { io: "input", unrepresentable: "any" }) as JsonSchema;
}

/** Converts a Hono route path to an OpenAPI path template. Exported so the drift test uses the exact same conversion as the document itself. */
export function honoPathToOpenApiPath(honoPath: string): string {
  if (honoPath.endsWith("/*")) {
    // Only `/api/media/*` uses a trailing wildcard today, for the R2 key.
    return `${honoPath.slice(0, -2)}/{key}`;
  }
  return honoPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

// ---------------------------------------------------------------------------
// Doc-only schemas for shapes with no shared Zod schema.
// ---------------------------------------------------------------------------

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

const sessionResultSchema = z.object({ role: z.enum(["owner", "visitor"]) });

const tagSchema = z.object({
  id: idSchema,
  name: z.string(),
  count: z.number().int().nonnegative(),
});
const tagsResultSchema = z.object({ tags: z.array(tagSchema) });

const categoriesResultSchema = z.object({ categories: z.array(categorySchema) });

const itemsListResultSchema = z.object({
  items: z.array(itemSchema),
  nextCursor: z.string().nullable(),
});

const itemRevisionSchema = z.object({
  id: idSchema,
  actor: z.string(),
  createdAt: z.string(),
});
const revisionsResultSchema = z.object({ revisions: z.array(itemRevisionSchema) });

const createdTokenSchema = apiTokenPublicSchema.extend({ token: z.string() });
const tokensResultSchema = z.object({ tokens: z.array(apiTokenPublicSchema) });

const unfurlRequestSchema = z.object({ url: z.string() });
const unfurlResultSchema = z.object({
  url: z.string(),
  canonicalUrl: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  siteName: z.string().optional(),
  platform: linkPlatformSchema,
  previewImage: z.string().optional(),
  author: z.string().optional(),
  embed: z.string().optional(),
});

const storedMediaSchema = z.object({ r2Key: z.string(), mime: z.string(), size: z.number() });
const mediaImportRequestSchema = z.object({ url: z.string() });

const healthSchema = z.object({ ok: z.boolean() });

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

interface ParamSpec {
  name: string;
  in: "path" | "query" | "header";
  required?: boolean;
  description?: string;
  schema: JsonSchema;
}

interface ResponseSpec {
  description: string;
  schema?: JsonSchema;
  contentType?: string;
}

interface RequestBodySpec {
  schema: JsonSchema;
  required?: boolean;
  contentType?: string;
}

type Security = "public" | "bearerOrOwner" | "ownerOnly";

interface RouteSpec {
  method: "get" | "post" | "patch" | "delete";
  /** Hono-style path, e.g. `/api/items/:id`. */
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  security: Security;
  /** Bearer scope required when `security` is `bearerOrOwner`; owner always qualifies regardless of scope. */
  scope?: "read" | "write";
  parameters?: ParamSpec[];
  requestBody?: RequestBodySpec;
  responses: Record<number, ResponseSpec>;
}

const idParam = (name: string, description: string): ParamSpec => ({
  name,
  in: "path",
  required: true,
  description,
  schema: schemaOf(idSchema),
});

const GARDEN_CLIENT_HEADER: ParamSpec = {
  name: "X-Garden-Client",
  in: "header",
  required: false,
  description:
    "Required (together with an allow-listed Origin) only when the write relies on an ambient owner credential (Access cookie/header) for CSRF protection; never required for a bearer-token request, since a token must be attached explicitly. See docs/api.md.",
  schema: { type: "string" },
};

function errorResponses(...codes: number[]): Record<number, ResponseSpec> {
  const descriptions: Record<number, string> = {
    400: "Invalid request body or query parameters.",
    401: "Authentication required (no owner session and no bearer token).",
    403: "Insufficient permissions (wrong token scope, or owner-only route).",
    404: "Resource not found.",
    422: "Request was well-formed but could not be processed.",
  };
  const out: Record<number, ResponseSpec> = {};
  for (const code of codes) {
    out[code] = {
      description: descriptions[code] ?? "Error.",
      schema: schemaOf(errorEnvelopeSchema),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Route table — one entry per registered `/api/*` route (T12: kept in sync
// with `createApp`'s route registration; the drift test fails loudly if a
// route is ever added/removed here without a matching app change or vice
// versa).
//
// Built lazily inside `buildRoutes()` (called only from `buildOpenApiDocument`,
// which memoizes its result) rather than as a module-level constant: every
// entry below calls `schemaOf`, which runs `z.toJSONSchema` immediately, and
// doing that at module-import time means any schema conversion failure
// throws while the Worker is still starting up — crashing the whole API, not
// just the one `/api/openapi.json` request.
// ---------------------------------------------------------------------------

function buildRoutes(): RouteSpec[] {
  return [
    {
      method: "get",
      path: "/api/health",
      summary: "Health check",
      tags: ["meta"],
      security: "public",
      responses: { 200: { description: "The API is up.", schema: schemaOf(healthSchema) } },
    },
    {
      method: "get",
      path: "/api/openapi.json",
      summary: "This OpenAPI 3.1 document",
      tags: ["meta"],
      security: "public",
      responses: { 200: { description: "The OpenAPI document." } },
    },
    {
      method: "get",
      path: "/api/session",
      summary: "Owner session probe",
      description:
        "Positive proof only: reports `owner` exactly when the caller's browser holds the owner's Access session. A valid bearer token still reports `visitor` here (it already knows its own scope).",
      tags: ["session"],
      security: "public",
      responses: { 200: { description: "Current role.", schema: schemaOf(sessionResultSchema) } },
    },
    {
      method: "get",
      path: "/api/items",
      summary: "List items",
      description: "Filtered, cursor-paginated item list. Public read.",
      tags: ["items"],
      security: "public",
      parameters: [
        {
          name: "kind",
          in: "query",
          description: "Repeatable. Filters to one or more item kinds (OR).",
          schema: { type: "array", items: schemaOf(itemKindSchema) },
        },
        {
          name: "tag",
          in: "query",
          description: "Repeatable. Filters to items carrying all given tags (AND).",
          schema: { type: "array", items: { type: "string" } },
        },
        {
          name: "categoryId",
          in: "query",
          description:
            "Repeatable. Filters to items under any given category, including descendants (OR).",
          schema: { type: "array", items: schemaOf(idSchema) },
        },
        {
          name: "color",
          in: "query",
          description: "Matches indexed item colors.",
          schema: schemaOf(hexColorSchema),
        },
        { name: "q", in: "query", description: "Full-text search.", schema: { type: "string" } },
        {
          name: "cursor",
          in: "query",
          description: "Opaque pagination cursor from a previous response.",
          schema: { type: "string" },
        },
        {
          name: "limit",
          in: "query",
          description: "Page size, 1-100.",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 40 },
        },
        {
          name: "includeDeleted",
          in: "query",
          description: "Owner or write-scope only: mixes trashed items into the results.",
          schema: { type: "boolean" },
        },
        {
          name: "deletedOnly",
          in: "query",
          description: "Owner or write-scope only: lists exclusively soft-deleted (trashed) items.",
          schema: { type: "boolean" },
        },
      ],
      responses: {
        200: { description: "Matching items.", schema: schemaOf(itemsListResultSchema) },
        ...errorResponses(400, 403),
      },
    },
    {
      method: "get",
      path: "/api/items/:id",
      summary: "Get item",
      description: "Public read.",
      tags: ["items"],
      security: "public",
      parameters: [idParam("id", "Item id.")],
      responses: {
        200: { description: "The item.", schema: schemaOf(itemSchema) },
        ...errorResponses(404),
      },
    },
    {
      method: "get",
      path: "/api/items/:id/revisions",
      summary: "List item revisions",
      tags: ["items"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [idParam("id", "Item id.")],
      responses: {
        200: {
          description: "Revision history, newest first.",
          schema: schemaOf(revisionsResultSchema),
        },
        ...errorResponses(401, 403),
      },
    },
    {
      method: "post",
      path: "/api/items",
      summary: "Create item",
      description:
        "`source` is computed server-side from the actor and the `X-Garden-Client` header; a client-supplied `source` is ignored.",
      tags: ["items"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [GARDEN_CLIENT_HEADER],
      requestBody: { schema: schemaOf(createItemInputSchema), required: true },
      responses: {
        201: { description: "Created item.", schema: schemaOf(itemSchema) },
        ...errorResponses(400, 401, 403),
      },
    },
    {
      method: "patch",
      path: "/api/items/:id",
      summary: "Update item",
      description: "`kind` is immutable; `data` is replaced whole per kind, not deep-merged.",
      tags: ["items"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [idParam("id", "Item id."), GARDEN_CLIENT_HEADER],
      requestBody: { schema: schemaOf(updateItemInputSchema), required: true },
      responses: {
        200: { description: "Updated item.", schema: schemaOf(itemSchema) },
        ...errorResponses(400, 401, 403, 404),
      },
    },
    {
      method: "delete",
      path: "/api/items/:id",
      summary: "Soft-delete item (trash)",
      tags: ["items"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [idParam("id", "Item id."), GARDEN_CLIENT_HEADER],
      responses: {
        200: { description: "The now-trashed item.", schema: schemaOf(itemSchema) },
        ...errorResponses(401, 403, 404),
      },
    },
    {
      method: "post",
      path: "/api/items/:id/restore",
      summary: "Restore a trashed item",
      tags: ["items"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [idParam("id", "Item id."), GARDEN_CLIENT_HEADER],
      responses: {
        200: { description: "The restored item.", schema: schemaOf(itemSchema) },
        ...errorResponses(401, 403, 404),
      },
    },
    {
      method: "post",
      path: "/api/items/:id/revisions/:revId/restore",
      summary: "Restore a specific revision",
      tags: ["items"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [
        idParam("id", "Item id."),
        idParam("revId", "Revision id."),
        GARDEN_CLIENT_HEADER,
      ],
      responses: {
        200: { description: "The item, reverted to that revision.", schema: schemaOf(itemSchema) },
        ...errorResponses(401, 403, 404),
      },
    },
    {
      method: "get",
      path: "/api/categories",
      summary: "List categories",
      description: "Flat list; `parentId` links each node to its parent. Public read.",
      tags: ["categories"],
      security: "public",
      responses: {
        200: { description: "All categories.", schema: schemaOf(categoriesResultSchema) },
      },
    },
    {
      method: "post",
      path: "/api/categories",
      summary: "Create category",
      tags: ["categories"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [GARDEN_CLIENT_HEADER],
      requestBody: { schema: schemaOf(createCategoryInputSchema), required: true },
      responses: {
        201: { description: "Created category.", schema: schemaOf(categorySchema) },
        ...errorResponses(400, 401, 403),
      },
    },
    {
      method: "patch",
      path: "/api/categories/:id",
      summary: "Rename and/or move a category",
      description: "`parentId: null` moves the category to the top level.",
      tags: ["categories"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [idParam("id", "Category id."), GARDEN_CLIENT_HEADER],
      requestBody: { schema: schemaOf(updateCategoryInputSchema), required: true },
      responses: {
        200: { description: "Updated category.", schema: schemaOf(categorySchema) },
        ...errorResponses(400, 401, 403, 404),
      },
    },
    {
      method: "delete",
      path: "/api/categories/:id",
      summary: "Delete a category",
      description:
        "Direct children are re-parented to the deleted category's own parent; items only lose the category link.",
      tags: ["categories"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [idParam("id", "Category id."), GARDEN_CLIENT_HEADER],
      responses: { 204: { description: "Deleted." }, ...errorResponses(401, 403, 404) },
    },
    {
      method: "get",
      path: "/api/tags",
      summary: "List tags with usage counts",
      tags: ["tags"],
      security: "public",
      responses: { 200: { description: "All tags.", schema: schemaOf(tagsResultSchema) } },
    },
    {
      method: "patch",
      path: "/api/tags/:id",
      summary: "Rename a tag",
      tags: ["tags"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [idParam("id", "Tag id."), GARDEN_CLIENT_HEADER],
      requestBody: { schema: schemaOf(renameTagInputSchema), required: true },
      responses: {
        200: { description: "Renamed tag.", schema: schemaOf(tagSchema) },
        ...errorResponses(400, 401, 403, 404),
      },
    },
    {
      method: "delete",
      path: "/api/tags/:id",
      summary: "Delete a tag",
      tags: ["tags"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [idParam("id", "Tag id."), GARDEN_CLIENT_HEADER],
      responses: { 204: { description: "Deleted." }, ...errorResponses(401, 403, 404) },
    },
    {
      method: "post",
      path: "/api/tokens",
      summary: "Create an API token",
      description:
        "The plaintext token is returned exactly once, in this response; only its hash is stored.",
      tags: ["tokens"],
      security: "ownerOnly",
      parameters: [GARDEN_CLIENT_HEADER],
      requestBody: { schema: schemaOf(createApiTokenInputSchema), required: true },
      responses: {
        201: {
          description: "Created token (includes the one-time plaintext secret).",
          schema: schemaOf(createdTokenSchema),
        },
        ...errorResponses(400, 401, 403),
      },
    },
    {
      method: "get",
      path: "/api/tokens",
      summary: "List API tokens",
      description: "Never includes the plaintext secret or its hash.",
      tags: ["tokens"],
      security: "ownerOnly",
      responses: {
        200: { description: "All tokens.", schema: schemaOf(tokensResultSchema) },
        ...errorResponses(401, 403),
      },
    },
    {
      method: "delete",
      path: "/api/tokens/:id",
      summary: "Revoke an API token",
      tags: ["tokens"],
      security: "ownerOnly",
      parameters: [idParam("id", "Token id."), GARDEN_CLIENT_HEADER],
      responses: { 204: { description: "Revoked." }, ...errorResponses(401, 403, 404) },
    },
    {
      method: "post",
      path: "/api/media",
      summary: "Upload media",
      description: "Multipart upload, validated by magic bytes (not the declared content type).",
      tags: ["media"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [GARDEN_CLIENT_HEADER],
      requestBody: {
        contentType: "multipart/form-data",
        required: true,
        schema: {
          type: "object",
          properties: { file: { type: "string", format: "binary" } },
          required: ["file"],
        },
      },
      responses: {
        201: { description: "Stored object.", schema: schemaOf(storedMediaSchema) },
        ...errorResponses(400, 401, 403, 422),
      },
    },
    {
      method: "get",
      path: "/api/media/*",
      summary: "Stream a stored media object",
      tags: ["media"],
      security: "public",
      parameters: [
        {
          name: "key",
          in: "path",
          required: true,
          description: "The R2 key returned by upload/import.",
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "The media object's bytes.", contentType: "*/*" },
        ...errorResponses(404),
      },
    },
    {
      method: "post",
      path: "/api/media/import",
      summary: "Import a remote image",
      description:
        "Fetches and stores a remote image server-side (used to persist link preview images).",
      tags: ["media"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [GARDEN_CLIENT_HEADER],
      requestBody: { schema: schemaOf(mediaImportRequestSchema), required: true },
      responses: {
        201: { description: "Stored object.", schema: schemaOf(storedMediaSchema) },
        ...errorResponses(400, 401, 403, 422),
      },
    },
    {
      method: "post",
      path: "/api/unfurl",
      summary: "Unfurl a link",
      description:
        "Returns Open Graph / oEmbed metadata for a URL. Never throws on partial metadata.",
      tags: ["unfurl"],
      security: "bearerOrOwner",
      scope: "write",
      parameters: [GARDEN_CLIENT_HEADER],
      requestBody: { schema: schemaOf(unfurlRequestSchema), required: true },
      responses: {
        200: {
          description: "Whatever metadata could be found.",
          schema: schemaOf(unfurlResultSchema),
        },
        ...errorResponses(400, 401, 403),
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Document assembly
// ---------------------------------------------------------------------------

function securityFor(
  security: Security,
  scope?: "read" | "write",
): Record<string, unknown>[] | undefined {
  if (security === "public") return undefined;
  if (security === "ownerOnly") return [{ ownerSession: [] }];
  // bearerOrOwner: either an owner session, or a bearer token of the required scope.
  return [{ ownerSession: [] }, { bearerAuth: scope ? [scope] : [] }];
}

function responseObject(spec: ResponseSpec): Record<string, unknown> {
  if (!spec.schema) return { description: spec.description };
  return {
    description: spec.description,
    content: { [spec.contentType ?? "application/json"]: { schema: spec.schema } },
  };
}

let cachedDocument: Record<string, unknown> | undefined;

/**
 * Builds the full OpenAPI 3.1 document — no request/app dependency. Lazy and
 * memoized: the first call builds and caches the document (module-level
 * `cachedDocument`); every later call (i.e. every subsequent request) returns
 * the cached object instead of re-running `z.toJSONSchema` over every route.
 */
export function buildOpenApiDocument(): Record<string, unknown> {
  if (cachedDocument) return cachedDocument;

  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of buildRoutes()) {
    const openApiPath = honoPathToOpenApiPath(route.path);
    const operation: Record<string, unknown> = {
      summary: route.summary,
      ...(route.description ? { description: route.description } : {}),
      tags: route.tags,
      ...(route.parameters ? { parameters: route.parameters } : {}),
      ...(route.requestBody
        ? {
            requestBody: {
              required: route.requestBody.required ?? false,
              content: {
                [route.requestBody.contentType ?? "application/json"]: {
                  schema: route.requestBody.schema,
                },
              },
            },
          }
        : {}),
      responses: Object.fromEntries(
        Object.entries(route.responses).map(([code, spec]) => [code, responseObject(spec)]),
      ),
    };
    const security = securityFor(route.security, route.scope);
    if (security) operation.security = security;

    paths[openApiPath] = { ...paths[openApiPath], [route.method]: operation };
  }

  cachedDocument = {
    openapi: "3.1.0",
    info: {
      title: "Inspiration Garden API",
      version: SCHEMA_VERSION,
      description:
        "Read/write API for the inspiration garden, for the web app, the browser extension, the PWA, and AI agents. See the 'For agents' section of docs/api.md for a quickstart.",
    },
    servers: [{ url: "/", description: "Same-origin deployment; see docs/api.md deploy notes." }],
    tags: [
      { name: "meta" },
      { name: "session" },
      { name: "items" },
      { name: "categories" },
      { name: "tags" },
      { name: "tokens" },
      { name: "media" },
      { name: "unfurl" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Scoped API token, sent as `Authorization: Bearer <token>`. Scopes are `read` and `read+write` (`write` implies `read`); create and revoke tokens via `/api/tokens` (owner only). Never satisfies an owner-only route.",
        },
        ownerSession: {
          type: "apiKey",
          in: "cookie",
          name: "CF_Authorization",
          description:
            "Cloudflare Access owner session cookie, set by visiting `/auth/login` in a browser. Not usable by agents — use a bearer token instead.",
        },
      },
    },
    paths,
  };
  return cachedDocument;
}
