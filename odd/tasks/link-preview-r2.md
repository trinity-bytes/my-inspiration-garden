# Link previews served from R2

## Objective

Make link preview images render on the WebGL canvas for every host by storing them in R2 and serving them same-origin from `/api/media/<key>`.

## Problem

The canvas loads thumbnails with `crossOrigin = "anonymous"` (`apps/web/src/canvas/card-painters.ts`). Hosts that do not send `Access-Control-Allow-Origin` (for example `repository-images.githubusercontent.com` for custom GitHub social previews, `www.ui-skills.com`) fail, so those cards fall back to text only. The detail modal is unaffected because its `<img>` does not request CORS.

## Why

Production v0.1.0 shows text-only cards for links with custom previews. Importing into R2 also protects against link rot.

## Scope

- In: server-side import of `link.data.previewImage` (http(s) URL) into R2 on item create and update; store the R2 key in `previewImage` (the shared schema already documents "remote URL or R2 key"); a shared key-or-URL resolver used by the canvas, the detail modal and the form preview; a one-off backfill script for existing link items in production.
- Out: public image proxy (rejected: either owner-only, or an open proxy / SSRF surface with per-view Worker CPU). Video thumbnails (same class of problem, not reported; follow-up).

## Constraints

- Branch `fix/link-preview-r2` from `main`. Work-unit commits local; push/PR are the owner's call.
- TDD on (source: explicit user choice, 2026-09-23; see `garden-mvp.md`). Runner: Vitest 4 (`@cloudflare/vitest-plugin` for the API). Commands: `mise exec -- pnpm test`, `mise exec -- pnpm typecheck`, `mise exec -- pnpm lint`.
- Import failure must never block saving: keep the remote URL and fall back as today.
- Reuse the existing import logic (`apps/api/src/http/routes/media.ts` import handler, `fetchSafe`, `sniffMime`, size caps) by extracting it into a shared function instead of duplicating it.
- RDD: off (global). Delivery: forecast ~350 authored lines, under the ~400 budget; single PR.

## Decisions

- Import location: **server-side in item create/update** (orchestrator, 2026-10-03). It covers API-token clients (agents, extension) that skip the web form, and avoids orphaned R2 objects that importing at unfurl time would create.

## Tasks

| ID | Task | Route | Status |
|----|------|-------|--------|
| L1 | API: extract `importRemoteImage` from the media import route; on link create/update, import an http(s) `previewImage` and store the R2 key; keep the URL on failure; skip values that are already keys | delegated | [x] |
| L2 | Web: key-or-URL resolver for `previewImage`, used by `thumbnailUrlForItem`, `ItemDetailModal` and the `ItemForm` preview | delegated | [x] |
| L3 | Backfill script for existing production link items (re-save each through the API so L1 imports them) | delegated | [x] |

Route evidence: L1 and L2 each touch 2+ non-trivial files (writer trigger); one writer handles L1–L3 sequentially.

## Acceptance criteria

- Creating or updating a link whose `previewImage` is an http(s) image URL stores an R2 key (`media/...`) in `previewImage`.
- A failed import keeps the original URL and the save still succeeds.
- The canvas, detail modal and form show previews for both keys and legacy URLs.
- After the backfill, production link cards with custom GitHub previews render their image.

## Progress

- 2026-10-03: Mapping done; feature document created. Next: L1.
- 2026-10-03: L1 done, commit 419b9f2. RED: 2 new item tests failed (create and update import) before implementation; GREEN: api 210 tests pass. `importRemoteImage` lives in `apps/api/src/lib/media-store.ts`, `importLinkPreview` in `lib/link-preview.ts`. PATCH replaces `data` wholesale, so the import runs on the submitted `data.previewImage`.
- 2026-10-03: L2 done, commit b97b06b. RED: `media-ref.test.ts` import failed and the thumbnail key case failed; GREEN: web 648 tests pass. Resolver at `apps/web/src/api/media-ref.ts`.
- 2026-10-03: L3 done, commit d4b14bc. Script `apps/api/scripts/backfill-link-previews.mjs` (env `GARDEN_API_URL`, `GARDEN_API_TOKEN`, `--dry-run`); repo does not test scripts, so smoke-tested the dry run against a local stub only. Documented in `docs/api.md`. Not run against production.
- 2026-10-03: Verification: `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass. Next: owner review, push/PR, then run the backfill.
