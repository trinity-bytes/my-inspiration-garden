# Feature: garden-mvp

Locator: `odd/tasks/garden-mvp.md` · Engram mirror: `odd/garden-mvp/tasks`

## Objective

Personal inspiration garden: an omnidirectional (360°) infinite canvas gallery collecting images, links, texts, videos, color palettes and fonts. Publicly readable from any device; only the owner (and owner-issued agent tokens) can write. Organized, filterable and easy to find for both the owner and AI agents.

## Problem / Why

Inspiration found across the web (Dribbble, Pinterest, X, sites) is scattered. The owner needs one fast-to-feed, well-classified place that AI agents can also read and write.

## Scope (this feature = Phase 1)

- Web app on desktop: browse the 360° canvas, filter, quick-add, edit everything.
- Single ingestion/read API shared by every future client.
- Out of scope (later phases, but architecture must support them without redesign):
  - Phase 2: browser extension (one-click capture).
  - Phase 3: mobile PWA with Web Share Target + iOS Shortcut.
  - Phase 4: MCP server for AI agents (REST + tokens already usable before that).

## Constraints and decisions

- Hosting: Cloudflare only — Pages (frontend), Workers (API), D1 + FTS5 (data/search), R2 (media), Access (owner login), optional Workers AI (tag suggestions). Chosen because Supabase free tier pauses inactive projects.
- Stack: pnpm monorepo, TypeScript, React + Vite, Hono, Drizzle (D1), Zod; shared types across web/API/extension/PWA.
- Auth: two layers — Cloudflare Access JWT for the owner web session; scoped bearer tokens (`read` | `read+write`) for extension, PWA and agents. Tokens individually revocable.
- Agents may write; their changes appear directly (no review inbox). Every item records `source`.
- Everything editable. Hybrid data model: fixed core columns + JSON `data` per kind; revision history for undo; soft delete (trash).
- Categories: hierarchical tree (`parent_id`, unlimited depth); items many-to-many with any node; filtering a parent includes descendants. Tags: flat, free.
- Item kinds: `image`, `link` (auto preview: OG/oEmbed), `text`, `video` (embed or short file/GIF), `palette`, `font`.
- Palettes auto-extracted from uploaded images to enable color filtering.
- Fonts: store source link + preview; do not upload commercial font files (license); free fonts rendered live.
- Visual theme: nature, clouds, glassmorphism; light colors, neither pastel nor highly saturated.
- Canvas: 2D infinite, virtualized (DOM + GPU transforms), drifts in the direction of the cursor relative to a central dead-zone radius; drag/touch and keyboard supported; respects `prefers-reduced-motion`. Varied, dynamic content layout.
- Artifacts (code, UI copy, docs) in English.

## TDD

- Mode: **on** — source: explicit user choice (2026-09-23). RED → GREEN → REFACTOR per behavior; UI/canvas apply TDD to extractable logic (drift math, virtualization, filters), not to pure styling.
- Runner: Vitest (`@cloudflare/vitest-pool-workers` for the API); exact commands fixed in T1.

## Delivery

- Forecast: ~4,000+ authored changed lines → exceeds the ~400-line budget. Strategy: `ask-on-risk`; chain strategy: **stacked-to-main** (user, 2026-09-23). Each ~400-line slice lands on `main` when verified. Commits local; push/PRs are the user's decision.
- Repository not yet initialized; `git init` + feature branch at T1.
- Toolchain: Node 26 + pnpm 10 pinned via `mise.toml` (brew unavailable on this machine).
- RDD: off (default) → ordinary checks, no review ceremony.
- Gate: **T7 requires the user's art direction** (references, palette, typography, glass intensity) before any UI styling.

## Tasks

| ID | Task | Route | Status |
|----|------|-------|--------|
| T1 | Monorepo scaffold: git init, pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`), TS config, lint/format, Vitest, wrangler config | delegated (writer trigger: 2+ files) | [x] `5ade9ca`, `f1820b7` |
| T2 | Shared domain package: Zod schemas for 6 item kinds, categories, tags, tokens, API DTOs | delegated | [ ] |
| T3 | D1 schema + Drizzle migrations: items, item_revisions, categories (tree), item_categories, tags, item_tags, api_tokens, FTS5 index + triggers | delegated | [ ] |
| T4 | API read endpoints: list with filters (kind, tags, category incl. descendants, color, full-text), cursor pagination, item detail, category tree | delegated | [ ] |
| T5 | API auth + write endpoints: Access JWT verification, scoped bearer tokens, create/update/delete/restore items, revisions, categories/tags CRUD, `source` tracking | delegated | [ ] |
| T6 | Ingestion services: link unfurl (OG/oEmbed for Dribbble/Pinterest/X/YouTube/Vimeo), image upload to R2, palette extraction | delegated | [ ] |
| T7 | Web shell: design tokens (nature/clouds/glass), layout, API client, owner session detection | delegated | [ ] |
| T8 | Omnidirectional infinite canvas: virtualization, cursor-direction drift with center dead-zone, drag/touch, keyboard, reduced motion | delegated | [ ] |
| T9 | Item cards per kind + detail view | delegated | [ ] |
| T10 | Filter panel: category tree, tags, kinds, color, search | delegated | [ ] |
| T11 | Quick-add + edit UI (owner only), revision history/restore, trash | delegated | [ ] |
| T12 | Token management UI + API docs (OpenAPI) for agents | delegated | [ ] |
| T13 | Deploy: Pages + Workers + D1 + R2 + Access setup, README | delegated | [ ] |

## Acceptance criteria

- Anonymous visitor can browse and filter the gallery on any device; any write without owner session or `read+write` token is rejected.
- Owner can add a link/image/text/video/palette/font in a few seconds with multiple categories and tags, and edit or restore any item.
- Canvas scrolls in all directions following the cursor direction from the center, smoothly with hundreds of items.
- An agent with a token can search, read and write via the same API.

## Progress

- 2026-09-23: Discovery complete; feature document created. Next: resolve TDD mode, then T1.
- 2026-09-23: TDD mode on (user). Next: chain strategy choice, then T1.
- 2026-09-23: T1 done on `feat/t1-scaffold` (`5ade9ca` scaffold, `f1820b7` API tests migrated to Vitest 4 + `@cloudflare/vitest-plugin` instead of a stale vitest 3 pin). Evidence: `mise exec -- pnpm test` 3/3 suites pass (RED observed first for each), `pnpm typecheck` clean, `pnpm lint` clean. ~350 authored lines (lockfile excluded). RDD off → no review. Next: T2.
