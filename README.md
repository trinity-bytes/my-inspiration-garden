# my-inspiration-garden

A personal, omnidirectional (360°) infinite canvas gallery for collecting inspiration — images,
links, texts, videos, color palettes and fonts — from across the web. It is publicly readable
from any device, while writes are restricted to the owner and owner-issued agent tokens, and is
built to stay organized and filterable for both the owner and AI agents.

## Workspace layout

```
apps/
  api/      Cloudflare Worker (Hono) — the API, backed by D1 (Drizzle) and R2, which also serves the web app's static assets
  web/      React + Vite web app — desktop canvas client
packages/
  shared/   Shared TypeScript types and Zod schemas used by api/web and future clients
```

## Requirements

- [mise](https://mise.jdx.dev) manages the pinned toolchain (`node 26`, `pnpm 10`) declared in
  `mise.toml`. Run every command below through `mise exec --`.

## Commands

```bash
mise exec -- pnpm install    # install all workspace dependencies
mise exec -- pnpm test       # run every workspace's test suite
mise exec -- pnpm typecheck  # type-check every workspace
mise exec -- pnpm lint       # lint and check formatting (Biome)
mise exec -- pnpm format     # apply formatting (Biome)
mise exec -- pnpm build      # build the web app into apps/web/dist
```

### Local development

`apps/api/.dev.vars` is gitignored, so create it once from the example — it turns every local
request into the owner, so you can skip Cloudflare Access entirely while developing:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
mise exec -- pnpm --filter @garden/api db:migrate:local   # apply migrations to local D1
mise exec -- pnpm --filter @garden/api dev                 # wrangler dev, http://localhost:8787
mise exec -- pnpm --filter @garden/web dev                 # vite, http://localhost:5173
```

Vite proxies `/api` and `/auth` to the Worker, so the web app talks to the API same-origin in dev
exactly as it will in production. Run the API first — the web app needs it to load any data.

## Deployment

**One Cloudflare Worker serves both the API and the web app's static assets, on one hostname.**
There is no Cloudflare Pages project.

`apps/api/wrangler.jsonc` sets `assets.directory` to the web build output
(`../web/dist`) with a single-page-application fallback, and
`run_worker_first: ["/api/*", "/auth/*"]` to send *only* those two path globs to Worker code.
Every other request is served from the asset directory without invoking the Worker at all.

### Why a single origin

Owner auth depends on it. The browser authenticates once at `/auth/login`, and Cloudflare Access
sets a `CF_Authorization` cookie that the browser then attaches automatically to every same-origin
request — that cookie *is* the owner's session. Split the UI and the API onto different origins and
the cookie stops being ambient, credentialed CORS becomes mandatory, and the CSRF guard has no
same-origin `Origin` left to check. One Worker also means one deploy, one hostname, and static
assets that are free and unmetered.

### Prerequisites

- A Cloudflare account with Workers, D1, R2 and Zero Trust (Access).
- `wrangler login`, once, on the machine that will deploy.
- A hostname you control, routed to the Worker.

> **This repository's machine has no Cloudflare credentials configured.** Nothing below has been
> run against a real account; the deploy config still carries placeholders.

### Placeholders to fill in `apps/api/wrangler.jsonc`

| Placeholder               | Replace with                                               |
| ------------------------- | ---------------------------------------------------------- |
| `database_id` (all zeros) | the id printed by `wrangler d1 create`                      |
| `bucket_name`             | the name printed by `wrangler r2 bucket create`             |
| `ACCESS_TEAM_DOMAIN`      | your Access team domain, e.g. `myteam.cloudflareaccess.com` |
| `ACCESS_AUD`              | the `AUD` tag of the Access application                     |
| `OWNER_EMAIL`             | the exact email Access reports for you                      |
| `CORS_ORIGINS`            | the production origin, exact, no trailing slash             |

`CORS_ORIGINS` is not only about cross-origin clients. The CSRF guard checks *same-origin* owner
writes against that same allowlist, so if the production origin is missing every owner write fails
with `403 csrf check failed`. Never widen it with a wildcard to silence that.

### Remote setup, in order

Steps 1–6 are one-time; step 7 is what every later release repeats. **None of this has been done
yet.**

1. **Authenticate** — `wrangler login`.
2. **Create the D1 database** — `wrangler d1 create inspiration-garden`, then paste the printed
   `database_id` into `wrangler.jsonc`. Migrations cannot run until this is filled in.
3. **Create the R2 bucket** — `wrangler r2 bucket create inspiration-garden-media`.
4. **Create the Access application**, scoped to **only** `/auth/login` on that hostname — not
   `/api/*`, and not the whole site. That narrow scope is what makes the gallery public while
   owner login works. Set the session cookie to `SameSite=Lax`, and leave its `Path` at the default
   so it is sent on every `/api/*` request, not just on `/auth/login`. Copy the application's `AUD`
   tag into `ACCESS_AUD`, and your email into `OWNER_EMAIL`.
5. **Fill the remaining placeholders** — the table above, including the production origin in
   `CORS_ORIGINS`.
6. **Apply migrations to the remote database** —
   `mise exec -- pnpm --filter @garden/api db:migrate:remote`.
7. **Deploy** — `mise exec -- pnpm run deploy` from the repository root. This builds the web app
   *first*, because `assets.directory` must exist when the Worker is deployed; deploying in the
   other order fails. Prefer this over `pnpm --filter @garden/api deploy` for exactly that reason.
8. **Verify** — `curl https://<your-hostname>/api/health`. `{"ok":true,"config":{"problems":[]}}`
   means every placeholder was replaced. If `ok` is `false`, each entry in `config.problems` names
   the binding at fault and what to do about it.

Sign-out needs no route of its own: the web app's "Sign out" link points at Cloudflare's
`/cdn-cgi/access/logout`.

Endpoint reference: [`docs/api.md`](docs/api.md).
