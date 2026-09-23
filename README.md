# my-inspiration-garden

A personal, omnidirectional (360°) infinite canvas gallery for collecting inspiration — images,
links, texts, videos, color palettes and fonts — from across the web. It is publicly readable
from any device, while writes are restricted to the owner and owner-issued agent tokens, and is
built to stay organized and filterable for both the owner and AI agents.

## Workspace layout

```
apps/
  api/      Cloudflare Worker (Hono) — the shared ingestion/read API, backed by D1 (Drizzle) and R2
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
```

Per-app dev servers:

```bash
mise exec -- pnpm --filter @garden/api dev   # wrangler dev
mise exec -- pnpm --filter @garden/web dev   # vite dev server
```
