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
| B2 | Confirm dialog before move-to-trash (reusable `ConfirmDialog`) | inline | [x] |
| B3 | Tag input with autocomplete from existing tags (keyboard accessible, still accepts new tags) | delegated | [x] |
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
- 2026-09-26: B2 done (inline). New `ConfirmDialog` (`apps/web/src/components/Dialog/ConfirmDialog.tsx`): title/message/confirmLabel/cancelLabel/destructive props, reuses `form-modal-backdrop`/`form-modal-dialog` + `useDialogFocusTrap`; Cancel rendered first so the shared trap's "focus first focusable" lands on Cancel. RED: `ConfirmDialog.test.tsx` (module didn't exist) → import-resolution failure, 0 tests run → GREEN 8/8 after implementation. Wired into `ItemDetailModal`'s "Move to trash" button (owner-only): click opens the dialog instead of calling `onDelete` directly; confirm calls `onDelete` and closes; cancel/backdrop/Escape leave the item untouched. RED: 3/20 new/changed `ItemDetailModal.test.tsx` assertions failed (old test expected immediate `onDelete`) → GREEN 20/20 after wiring. Found and fixed a real nested-dialog bug during this task (not just following existing pattern): with the confirm dialog nested inside the detail dialog, both mounted their own `document` "Escape" listeners simultaneously, so Escape while confirming closed the whole detail view too, not just the confirm — added a regression test (RED 1/21 new dialog test failed) and guarded `ItemDetailModal`'s own Escape/Tab-trap effects with a `confirmingDelete` state check so the nested `ConfirmDialog` owns Escape/Tab while open → GREEN 21/21. Updated `App.owner-actions.test.tsx`'s existing trash e2e test for the new two-step flow (click trigger, then confirm inside the nested dialog). Added `--color-danger`/`--color-danger-strong`/`--color-danger-soft` semantic tokens to `tokens.css` (no danger/destructive color existed yet) for the destructive confirm button style. Evidence: full workspace 793/793 (shared 71, web 571, api 151), typecheck clean, lint clean (biome auto-fixed 4 files' line-wrap formatting only). Commit: `5904617`. Next: B3.
- 2026-09-26: B3 done (delegated). New `TagInput` (`apps/web/src/forms/TagInput.tsx`): chips for existing tags (removable via an "×" button, `aria-label="Remove tag <name>"`); the underlying `<input>` carries `role="combobox"`/`aria-expanded`/`aria-controls`/`aria-autocomplete="list"`/`aria-activedescendant`; suggestions render in a `role="listbox"` div (switched from `ul`/`li` to `div` — biome's `noNoninteractiveElementToInteractiveRole`/`useFocusableInteractive` a11y rules flag list elements carrying `listbox`/`option` roles; used plain divs + `tabIndex={-1}` on options instead, consistent with the ARIA `aria-activedescendant` combobox pattern where real focus never leaves the input). Suggestions: fetched once from `getTags()` (fail-soft — a rejected fetch just leaves the list empty, free entry still works, RED-tested), filtered case/accent-insensitive (NFD-normalize + strip diacritics + lowercase) against the typed draft, excluding already-selected tags (case-insensitive), sorted by `count` descending. Enter/comma commit the highlighted suggestion or the typed text as a new tag (preventDefault so comma doesn't land in the field and Enter doesn't submit the form); Tab commits without preventing default (so focus still advances); ArrowUp/Down move `highlightedIndex` with wraparound; Backspace on an empty draft removes the last chip; duplicate tags (case-insensitive) are silently ignored. RED: `TagInput.test.tsx` (module didn't exist) → import-resolution failure, 0 tests run → GREEN 14/14 after implementation. Refactored `ItemFormState.tagsInput: string` → `tags: string[]` (the comma-separated free-text field is gone, so `parseTagsInput`/the internal `tagsInputFrom` helper were removed rather than kept as dead code) in `item-form-state.ts`; `buildCreateItemInput` now passes `state.tags` straight through. RED: 3 `item-form-state.test.ts` assertions on the old `tagsInput` field failed after the interface change → GREEN 15/15 once tests were updated to the array shape. Wired `TagInput` into `ItemForm.tsx`'s Tags field (same `htmlFor`/id pattern, so `getByLabelText("Tags")` still resolves the input). Updated `ItemForm.test.tsx` (comma-string paste → two Enter-committed chips) and `App.owner-actions.test.tsx` (unaffected — didn't touch tags) for the new interaction. Evidence: full workspace 805/805 (shared 71, web 583, api 151), typecheck clean, lint clean (biome auto-fixed formatting in 3 files; manually fixed the `role="option"`/`role="listbox"` a11y findings as above). Decision: suggestions only appear once the draft is non-empty (not on focus with an empty field) — matches "typing shows suggestions" in the task wording; not capped in count (owner has a small tag vocabulary so far). Commit: `c4ee99f`. Next: B4.
