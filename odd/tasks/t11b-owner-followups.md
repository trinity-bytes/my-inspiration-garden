# T11b — Owner follow-ups to the edit UI

## Objective

Apply the owner's decisions after live QA of T11 (2026-09-26): full category management, trash confirmation, video auto-fill, tag autocomplete, and palette color proportions. Also isolate API tests from the local `DEV_OWNER_BYPASS` flag.

## Why

T11 shipped with four simplifying defaults. The owner reviewed them live and rejected all four; they also asked for per-color proportions in palettes because proportion matters for design work.

## Scope

- In: category CRUD UI with hierarchy (create, rename, move/reparent, delete) plus the web client for existing API endpoints; confirm dialog before move-to-trash; video URL auto-fill (provider, embed URL, title, thumbnail) via the existing `POST /api/unfurl`; tag input with autocomplete from `GET /api/tags`; palette per-color weight (schema, form, `item_colors` weights, card and detail rendering, reseed script); API test isolation from `.dev.vars`.
- Out (deferred by owner): automatic palette extraction from uploaded images (a library can handle it later).

## Constraints

- Branch `feat/t11b-owner-followups`, stacked on `feat/t11-edit-ui`. Commits local; push/PR are the owner's call.
- TDD on (source: explicit user choice, 2026-09-23; see `garden-mvp.md`). Runner: Vitest 4 (`@cloudflare/vitest-plugin` for the API). Commands: `mise exec -- pnpm test`, `mise exec -- pnpm typecheck`, `mise exec -- pnpm lint`.
- Artifacts in English. Reuse the existing modal pattern (`form-modal-backdrop`/`form-modal-dialog` + `useDialogFocusTrap`).
- Delivery: forecast ~1,500 authored lines, over the ~400 budget; strategy inherited from `garden-mvp.md` (stacked-to-main), one commit per task.

## Open decisions

- Palette proportion input: **decided (owner, 2026-09-26)** — a numeric percentage field per color; values that don't sum to 100 are normalized proportionally.
- Category delete behavior: today the DB promotes children to root and unlinks items (confirm or change).

## Tasks

| ID | Task | Route | Status |
|----|------|-------|--------|
| B1 | API tests ignore `DEV_OWNER_BYPASS` from `.dev.vars` | inline | [x] |
| B2 | Confirm dialog before move-to-trash (reusable `ConfirmDialog`) | inline | [ ] |
| B3 | Tag input with autocomplete from existing tags (keyboard accessible, still accepts new tags) | delegated | [ ] |
| B4 | Video auto-fill: map unfurl result to `provider`/`embedUrl`/`thumbnail`/title for YouTube and Vimeo URLs | delegated | [ ] |
| B5 | Palette per-color weight: shared schema, form input, `deriveItemColors` honors weights (fallback even split), proportional bands in card + detail, reseed script | delegated | [ ] |
| B6 | Category management: web client (create/update/delete), manager UI with tree (create child, rename, move, delete), picker refresh in forms/filters | delegated | [ ] |

Route evidence: B3–B6 each touch 2+ non-trivial files (writer trigger); B1–B2 are small and local.

## Acceptance criteria

- API test suite passes with `apps/api/.dev.vars` containing `DEV_OWNER_BYPASS=true`.
- Moving an item to trash asks for confirmation; cancel leaves it untouched.
- Typing in the tags field suggests existing tags; new tags still allowed.
- Pasting a YouTube/Vimeo URL fills provider, embed URL, title, and thumbnail; fields stay editable.
- A palette stores a weight per color; bands on the card and in the detail view are sized by weight; color filtering uses the weights.
- The owner can create, rename, move, and delete categories at any depth; cycles are rejected with a clear message.

## Progress

- 2026-09-26: Feature document created after owner decisions and a code map. Next: resolve the palette input decision, then B1.
- 2026-09-26: B1 done (inline). RED: with `.dev.vars` (`DEV_OWNER_BYPASS=true`) present, api suite 26/151 failed (wrangler does load `.dev.vars` into tests, contrary to the code map). GREEN: pinned `DEV_OWNER_BYPASS: "false"` in `apps/api/vitest.config.ts` miniflare bindings; 151/151 with `.dev.vars` present; per-test `testEnv({ DEV_OWNER_BYPASS: "true" })` overrides still exercised. `.dev.vars` can now stay for local QA. Next: B2.
