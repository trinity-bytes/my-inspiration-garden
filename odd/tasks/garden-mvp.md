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
- Visual theme (art direction, 2026-09-23): peaceful dusk **sky** ambient (no horizon — canvas drifts in all directions). Palette derived from the owner's sunset photo, light theme: lavender/purple scale `#F6F3FA #E9E3F3 #D5CBE8 #B3A3D1 #8F7BB5 #5E4C82`, ink `#2A2140`, accent apricot `#F29A6B` (strong `#E0784E`, soft `#FCE3D3`); no hot pink. Accent fills use ink text (white fails AA). Typography: **Geist** only (variable), hierarchy by weight/size, no serif. Frosted-glass navbar with search + filters. Polished microinteractions later.
- Visual assets: masters in `assets/images/` (git-ignored, too heavy): `sky-seamless.png` (tileable both axes), `cloud-1..4.png` (alpha sprites, light from below), `landscape.png` (loading/empty state, anchor `center bottom`). Web derivatives (AVIF/WebP) committed under `apps/web/public/images/`. Far haze is procedural (shader noise), not an image.
- Canvas: **WebGL via three.js** (vanilla, driven imperatively from a React component; not r3f). React owns DOM UI (navbar, filters, detail) plus a parallel invisible DOM/ARIA layer for keyboard and screen readers; hit-testing from layout math. 2D infinite wrap with repeated items, subtle spherical (inside-a-sphere) distortion, cards fade transparent→solid entering view, sky/cloud parallax. Virtualized; drifts in the direction of the cursor relative to a central dead-zone (~100px diameter, responsive), speed grows with distance, smooth easing/inertia; drag/touch and keyboard supported; respects `prefers-reduced-motion`. Varied, dynamic content layout.
- Artifacts (code, UI copy, docs) in English.

## TDD

- Mode: **on** — source: explicit user choice (2026-09-23). RED → GREEN → REFACTOR per behavior; UI/canvas apply TDD to extractable logic (drift math, virtualization, filters), not to pure styling.
- Runner: Vitest 4 (`@cloudflare/vitest-plugin` for the API). Commands: `mise exec -- pnpm test`, `mise exec -- pnpm typecheck`, `mise exec -- pnpm lint`.

## Delivery

- Forecast: ~4,000+ authored changed lines → exceeds the ~400-line budget. Strategy: `ask-on-risk`; chain strategy: **stacked-to-main** (user, 2026-09-23). Each ~400-line slice lands on `main` when verified. Commits local; push/PRs are the user's decision.
- Branches stack: `feat/t1-scaffold` → `feat/t2-t3-domain-db` → … each slice branched from the previous one; merges to `main` are the user's call.
- Toolchain: Node 26 + pnpm 10 pinned via `mise.toml` (brew unavailable on this machine).
- RDD: off (default) → ordinary checks, no review ceremony.
- Gate: T7 art direction — **resolved 2026-09-23** (see Visual theme).

## Tasks

| ID | Task | Route | Status |
|----|------|-------|--------|
| T1 | Monorepo scaffold: git init, pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`), TS config, lint/format, Vitest, wrangler config | delegated (writer trigger: 2+ files) | [x] `5ade9ca`, `f1820b7` |
| T2 | Shared domain package: Zod schemas for 6 item kinds, categories, tags, tokens, API DTOs | delegated | [x] `5c3a672` |
| T3 | D1 schema + Drizzle migrations: items, item_revisions, categories (tree), item_categories, tags, item_tags, api_tokens, FTS5 index + triggers | delegated | [x] `48dc772`, `44dbba5` |
| T4 | API read endpoints: list with filters (kind, tags, category incl. descendants, color, full-text), cursor pagination, item detail, category tree | delegated | [x] `1b434d0`, `7b9be65` |
| T5 | API auth + write endpoints: Access JWT verification, scoped bearer tokens, create/update/delete/restore items, revisions, categories/tags CRUD, `source` tracking | delegated | [x] `7b9be65`, `e1c98bb`, `940d653` |
| T6 | Ingestion services: link unfurl (OG/oEmbed for Dribbble/Pinterest/X/YouTube/Vimeo), image upload to R2, palette extraction | delegated | [x] `dcc515d`, `e7f6f90`, `08db915`, `6cd3ab4` |
| T7 | Web shell: design tokens (palette, Geist, glass), web asset derivatives, layout (full-viewport canvas host + frosted-glass navbar with search/filter entry points), loading screen, API client, owner session detection | delegated (writer trigger: 2+ files) |[x] `a41e5a9`, `66d628e`, `3294a08`, `9a5e353`, `cbd52a8`, `c033c51`, `cadbf31`, `a7745e4` |
| T7b | Owner auth hardening: same-origin topology, Access protects only `/auth/login`, actor accepts `Cf-Access-Jwt-Assertion` header or `CF_Authorization` cookie (same verification), `GET /api/session` positive proof, CSRF guard (Origin allowlist + required `X-Garden-Client` on unsafe methods for Access-authenticated actors), logout, web session via `/api/session` | delegated (writer trigger: 2+ files) || [x] `c7acb1d`, `06a4db4`, `0523307`, `d3ace75`, `95430d8`, `280a9c7`, `c551e57`, `06ce8ad` |
| T8 | WebGL (three.js) infinite canvas: sky + cloud parallax + procedural haze, spherical distortion, fade-in, virtualization/wrap, cursor drift with dead-zone, drag/touch, keyboard, reduced motion | delegated | [ ] |
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
- 2026-09-23: T2+T3 done on `feat/t2-t3-domain-db` (`5c3a672` shared schemas, `48dc772` D1 schema/migrations/FTS5, `44dbba5` FTS5 migration registered in drizzle journal + `wrangler types`). Evidence: 46/46 tests (shared 37, api 8, web 1), RED observed first; typecheck + lint clean; 3 migrations apply on fresh local D1. Decisions: `categories.parent_id ON DELETE SET NULL` (children promoted to root); standalone FTS5 table keyed by `id` synced by triggers on `items`; tags reach FTS via denormalized `items.search_text` maintained by the repository layer (T4/T5 must keep it updated); update DTO is top-level partial, `data` replaced whole; ids ULID or UUID. Next: T4.
- 2026-09-23: T4+T5 done on `feat/t4-t5-api` (`1b434d0` repositories ~1000 lines, `7b9be65` http/auth/routes ~1500 lines, `e1c98bb` drop unused dep, `940d653` auth test gaps). **TDD deviation**: the writer wrote tests alongside code (no RED evidence) — disclosed, not fabricated. Mitigation: independent verifier ran 11 mutations; 9 caught, 2 gaps (real Access JWT `aud`/`iss` path untested; `DEV_OWNER_BYPASS` strictness untested) → one scoped correction made the production verifier path testable via injected key source and added cases; mutation re-run: 8 new tests fail when guards are broken. Security read: no high findings (256-bit tokens hashed, allowlist CORS, parameterized SQL, no leaked internals, bypass absent from wrangler vars). Evidence: 97/97 tests (shared 37, api 59, web 1), typecheck + lint clean. Slice exceeds ~400-line budget (~2,500 authored) — cohesive auth/routes unit; noted for review. Decisions: color match = RGB distance ≤ 60 computed in JS; FTS q wrapped as one escaped phrase; cursor base64url {createdAt,id}; `source` server-computed (`web`/`extension`/`pwa`/`agent:<token name>` via `X-Garden-Client`). Next: T6.
- 2026-09-23: T6 done on `feat/t6-ingestion` (`dcc515d` shared palette/url/platform/unfurl helpers, `e7f6f90` media upload + remote import + unfurl, `08db915` item_colors from image/palette items, `6cd3ab4` SSRF redirect fix). Strict TDD with RED evidence per behavior group. Parent review found SSRF bypass via auto-followed redirects → scoped correction: `safeFetch` with `redirect: "manual"`, per-hop `isSafeFetchUrl`, 5-hop cap; also added missing `/api/media/import` integration tests. Evidence: 184/184 tests (shared 70, api 113, web 1), typecheck + lint clean. Decisions: palette extracted client-side (median-cut, deterministic) since Workers can't decode images cheaply; magic-byte validation; limits 15 MB image / 50 MB video (`MAX_IMAGE_BYTES`/`MAX_VIDEO_BYTES`); R2 keys `media/<yyyy>/<mm>/<uuid>.<ext>`; Pinterest oEmbed liveness unverified (falls back to OG). ~1,600 authored lines. Endpoints in `docs/api.md`. Next: T7 (blocked on user's art direction).
- 2026-09-23: Art direction resolved (sky ambient, lavender/apricot palette from owner's photo, Geist, frosted glass). Assets delivered (sky seamless-fixed in post, 4 cloud sprites sliced with halo cleanup, landscape); haze procedural. Rendering: WebGL + vanilla three.js. Branch `feat/t7-web-shell` from `feat/t6-ingestion`. Next: T7.
- 2026-09-23: T7 done on `feat/t7-web-shell`. Parent: doc/gitignore (`a41e5a9`), web image derivatives 110MB→1.2MB (`66d628e`). Writer: deps zod + `@fontsource-variable/geist@5.3.0` (`3294a08`), test DOM cleanup fix — `test.globals` off so RTL auto-cleanup never ran (`9a5e353`), typed API client with Zod validation (`cbd52a8`), owner session detection (`c033c51`), tokens + Geist + glass navbar (⌘K search, filters stub) + CanvasHost sky fallback + LoadingScreen (`cadbf31`). Parent visual check (headless 1440×900, 390×844) found the loading message hidden under the navbar → fix `a7745e4`. Evidence: 218/218 tests (web 35), typecheck + lint clean, web build OK; RED observed first per behavior. ~1,330 authored lines (cohesive slice > advisory budget). RDD off; assess = medium (`slice_budget_reached`) → writer self-verification + parent spot check (web tests 35/35). Gaps: (1) no `/api/me`-style endpoint — session detection probes `GET /api/items?includeDeleted=true` (403 for non-owner); a dedicated endpoint is cleaner; (2) API CORS omits `Access-Control-Allow-Credentials`, so cross-origin `credentials: "include"` reads fail if Access relies on cookies — resolve with deploy topology (same-origin route avoids it). Loading screen stays up until T8 sets canvas ready (intentional). Next: T8 (three.js canvas).
- 2026-09-23: User rejected owner detection by elimination. Parent found latent T5 bug: API only reads `Cf-Access-Jwt-Assertion`, which Access injects only on protected routes → owner never recognized on public `/api/*` in production. Accepted design → new task T7b (branch `feat/t7b-owner-auth` from `feat/t7-web-shell`). Sources: Cloudflare Access authorization-cookie and validating-json docs (cookie carries app token in browsers; header preferred where available; app cookie SameSite default None → set Lax).
- 2026-09-23: T7b done on `feat/t7b-owner-auth`. Writer: cookie-or-header owner resolution (`c7acb1d`), `GET /api/session` + `GET /auth/login` fixed 302 `/`, no `next` (`06a4db4`), CSRF guard (`0523307`), docs + deploy notes (`d3ace75`), web session via `/api/session` (`95430d8`), `credentials: "same-origin"` + `X-Garden-Client` always (`280a9c7`), owner Sign out + Vite dev proxy `/api` `/auth` (`c551e57`). Strict TDD with RED per behavior group. Evidence: 264/264 tests (shared 70, web 44, api 150), typecheck/lint/build clean. ~873 authored lines. Assess = **high** (auth hot path) → independent verifier: PASS WITH NOTES; tests run through the real Hono stack; mutations 6/7 caught (miss = owner-via-cookie CSRF exemption, masked by the equivalent `cookiePresent` clause — not a live gap); mount order cors → actor → csrf → routes; no mutation reachable outside `/api/*`; dev bypass absent from `wrangler.jsonc`. Medium finding fixed by parent (`06ce8ad`): docs said `CORS_ORIGINS` was only for cross-origin clients, but the CSRF guard checks same-origin owner writes against it → deploy must list the site origin. Accepted decision: anonymous write carrying a stray/invalid `CF_Authorization` cookie gets 403 (CSRF) instead of 401 — verifier: sound. Follow-up (low, pre-existing T5): `originAllowed` trailing-`*` wildcard is a bare `startsWith` with no boundary check and no test; harden if wildcards are ever used beyond extension origins. Next: T8.
