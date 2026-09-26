# API: endpoints

Base URL: the deployed Worker origin. Auth: owner (Access session) or a
`write`-scope bearer token, unless noted otherwise. See `apps/api/src/http/routes`
for the full implementation.

## Auth (T7b)

Same-origin topology: the web app and the API share one hostname, and the
Worker serves both `/api/*` and `/auth/*`. Cloudflare Access protects
**only** `GET /auth/login` (configured in the Cloudflare dashboard, not in
code — see "Deploy notes" below); `/api/*` is otherwise public so anonymous
visitors can browse and filter.

- **Owner session**: the browser visits `/auth/login`; Access authenticates
  it and sets the `CF_Authorization` session cookie, then the handler
  redirects to `/`. From then on every same-origin request automatically
  carries that cookie. The API's actor middleware resolves the owner from
  `Cf-Access-Jwt-Assertion` when that header is present (non-browser /
  server-to-server callers), otherwise from the `CF_Authorization` cookie —
  same verification either way (signature, `alg`, `exp`, `iss`, `aud`, then
  `email === OWNER_EMAIL`).
- **Bearer tokens**: `read` | `read+write` scoped tokens for the extension,
  PWA and agents, via `Authorization: Bearer <token>`. Individually
  revocable (`/api/tokens`, owner only).
- **`GET /api/session`** — public. `{ "role": "owner" | "visitor" }`, positive
  proof only (owner exactly when the actor resolved to the owner; a valid
  bearer token still reports `"visitor"` here — this endpoint answers "is
  this browser the owner", not "is this request authorized to write").
  Never returns the email or any credential data. `Cache-Control: no-store`;
  `Vary: Cookie, Cf-Access-Jwt-Assertion`.
- **`GET /auth/login`** — Access-protected at deploy. Once Access has
  authenticated the owner, redirects `302` to `/`. Accepts no redirect
  target from the request (no `next` param), so there is nothing for an
  open-redirect attack to target.
- **Logout**: `/cdn-cgi/access/logout` (Cloudflare's built-in Access logout
  route — clears the session cookie).
- **CSRF**: unsafe methods (`POST`/`PUT`/`PATCH`/`DELETE`) on `/api/*`
  require, whenever the write could succeed on an ambient credential (the
  owner via Access, header or cookie, or any request carrying a
  `CF_Authorization` cookie while the local dev bypass is off) — **both**:
  - `Origin` exactly matching an entry in `CORS_ORIGINS`;
  - `X-Garden-Client` present (any value; being a non-CORS-safelisted
    header, it forces a preflight a cross-site request can't satisfy).
  A bearer-token write is exempt (never ambient — the caller must know and
  attach the token explicitly). Failure: `403 forbidden`, standard error
  envelope. Safe methods (`GET`/`HEAD`/`OPTIONS`) are untouched.
- **CORS**: same-origin needs no credentialed CORS, so
  `Access-Control-Allow-Credentials` is never sent. `CORS_ORIGINS` (a
  comma-separated allowlist, trailing `*` wildcard supported) serves two
  purposes: CORS for cross-origin, non-cookie clients (extension, PWA, local
  dev on a different port) **and** the CSRF guard's `Origin` check. Browsers
  send `Origin` on same-origin `POST`/`PUT`/`PATCH`/`DELETE` too, so the
  site's own origin must be listed or every owner write returns `403`.

## Media

- `POST /api/media` — multipart upload (`file` field). Accepts `image/jpeg`,
  `image/png`, `image/webp`, `image/gif`, `image/avif`, `video/mp4`,
  `video/webm`, validated by magic bytes (not the declared content type).
  Size caps per kind: 15 MB images / 50 MB video by default, tunable via the
  `MAX_IMAGE_BYTES`/`MAX_VIDEO_BYTES` wrangler vars. Stores the file in R2
  under `media/<yyyy>/<mm>/<uuid>.<ext>`. Returns `{ r2Key, mime, size }`.
- `GET /api/media/*key` — public, no auth. Streams the object from R2 with
  `Cache-Control: public, max-age=31536000, immutable` and an `ETag`; 404 if
  the key doesn't exist.
- `POST /api/media/import { url }` — fetches a remote image on the server's
  behalf and stores it the same way as a direct upload (used to persist link
  preview images so they survive the source page disappearing). `url` must
  be `http`/`https` and not resolve to a loopback/private/link-local host or
  IP literal; the fetch has a 10s timeout and a manual byte cap while
  streaming (the response's `Content-Length` is never trusted); the
  downloaded content is revalidated by magic bytes.

## Link unfurl

- `POST /api/unfurl { url }` — returns
  `{ url, canonicalUrl?, title?, description?, siteName?, platform, previewImage?, author?, embed? }`.
  `platform` is detected from the hostname
  (`dribbble` | `pinterest` | `x` | `behance` | `youtube` | `vimeo` | `other`).
  Tries oEmbed first for platforms that have one (YouTube, Vimeo, X,
  Pinterest); otherwise fetches the page HTML (capped at 512 KB, same URL
  safety/timeout rules as media import) and extracts Open Graph / Twitter
  card / `<title>` / meta description / `link[rel=canonical]` via
  `HTMLRewriter`, resolving relative image URLs against the page URL. Never
  throws on partial metadata — returns whatever it found.

## Palette / color indexing

- Palette extraction itself runs client-side (`extractPalette` in
  `packages/shared/src/palette.ts`) since Workers can't decode images
  cheaply; the API only indexes what the client sends.
- When an `image` item's `data.palette` (an array of hex strings or
  `{ hex, weight }` objects) or a `palette` item's `data.colors` is present
  on create/update, the API populates `item_colors` for that item
  (`ItemsRepository`), fully replacing the previous set on every update
  (including a revision restore). `GET /api/items?color=#RRGGBB` matches
  against these rows.

## Deploy notes (T13)

Cloudflare setup this feature's auth model depends on (do at deploy time,
not automated here):

- **Routes**: the Worker (`garden-api`) and the Pages/Worker-served web app
  share one hostname; route `/api/*` and `/auth/*` to the Worker, everything
  else to the web app.
- **Access application**: create one Cloudflare Access application scoped
  to **only** `/auth/login` on that hostname (not `/api/*`, not the rest of
  the site) — this is what makes the owner login flow work while keeping
  the gallery public.
  - Set the Access app's session cookie **`SameSite=Lax`** (Access defaults
    to `SameSite=None`, which needs `Secure` and behaves differently across
    browsers for a same-origin app — `Lax` is simpler and correct here
    since the cookie is only ever read same-origin).
  - Leave the cookie's **`Path`** attribute disabled/default so it's sent
    on every `/api/*` request, not just `/auth/login`.
- **`ACCESS_AUD`**: set to that Access application's AUD tag (`wrangler.jsonc`
  `vars.ACCESS_AUD`, or a deployment secret).
- **`OWNER_EMAIL`**: the exact email Access will report for the owner.
- **`CORS_ORIGINS`**: must include the production site's own origin
  (e.g. `https://garden.example.com`, exact, no trailing slash) — the CSRF
  guard checks owner writes against it — plus any extension/PWA origins.
  Never add a broad wildcard to "fix" a `403 csrf check failed`.
- **Logout**: no separate route needed — Cloudflare serves
  `/cdn-cgi/access/logout` automatically for any hostname with an Access
  application; the web app's "Sign out" link just points there.

## For agents

The garden is designed to be read and written by AI agents through the same
REST API the web app uses — no separate MCP server exists yet (planned for a
later phase), but the API and tokens described here are already usable.

1. **Create a token.** Sign in as the owner in the web app and open **API
   tokens** from the navbar (next to **Categories**). Create a token with a
   name and a scope — `read` for browsing only, or `read + write` to also
   create/update/delete items, categories, and tags (`write` always implies
   `read`). The plaintext token is shown exactly once, right after creation —
   copy it immediately; it cannot be retrieved again (only revoked and
   replaced with a new one).
2. **Read the machine-readable spec.** `GET /api/openapi.json` serves an
   OpenAPI 3.1 document covering every `/api/*` route (items, categories,
   tags, tokens, session, media, unfurl), generated from this project's own
   Zod schemas — feed it directly to an OpenAPI-aware client/codegen tool
   instead of hand-transcribing this page.
3. **Call the API** with `Authorization: Bearer <token>`:

   ```sh
   # List the 5 most recent items
   curl "https://garden.example.com/api/items?limit=5" \
     -H "Authorization: Bearer ig_your_token_here"

   # Create a text item (needs a write-scope token)
   curl -X POST "https://garden.example.com/api/items" \
     -H "Authorization: Bearer ig_your_token_here" \
     -H "Content-Type: application/json" \
     -d '{"kind":"text","data":{"body":"Noted via agent"}}'
   ```

   A bearer token is exempt from the CSRF guard above (it's never an ambient
   credential), so `Origin`/`X-Garden-Client` are not required on token
   requests — only for owner-session writes from a browser.

## Local dev reseed

`apps/api/scripts/reseed-dev-items.sql` refreshes the local-only seed data (opaque photos instead of the canvas's transparent cloud sprites, 3-5 realistic items per kind) — run with `pnpm exec wrangler d1 execute inspiration-garden --local --file=scripts/reseed-dev-items.sql` from `apps/api`; never pass `--remote`.
