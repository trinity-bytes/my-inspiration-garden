# Performance and cleanup sweep
Objective: Apply every verified optimization and cleanup finding from the 2026-11-07 audit (bugs, API, frame loop, architecture, comments).
Branch: perf/canvas-layout-cache; delivery: one branch with one Conventional Commit per work unit, left ready to push (push/PR owner-approved); forecast: ~1500 authored lines; runner: mise exec -- pnpm test (heavy suites deferred to the owner's larger instance).

## Specs
S1. Card texture cache keys must change when an item is edited (`updatedAt`) or painted at a different size, so edited/resized cards never keep a stale texture.
S2. List filters (tags, categories, colors, search) must not bind one SQL parameter per matching id; use subqueries/EXISTS so large libraries stay under D1's bound-parameter limit. Results and ordering unchanged.
S3. The color filter must not read the whole `item_colors` table per request; narrow it in SQL. Results unchanged. Additive schema changes only.
S4. Reduce sequential D1 round trips: relation fetches batched; writes avoid redundant reads where results are unchanged.
S5. Add an index matching the list query's filter + sort (`deleted_at`, `created_at DESC`, `id DESC`) as an additive migration.
S6. The accessibility DOM mirror must not copy/sort/stringify every frame when the visible set did not change.
S7. Remove avoidable per-frame/per-card allocations (navigation vectors, frame object, hover style, assignment key, screen rect) without changing rendering.
S8. Pointer moves must not force layout per event or rebuild the hit-test list per event.
S9. Saving one item must not refetch the whole library or rebuild the canvas; superseded fetches are aborted.
S10. One shared font loader (cached per URL, timer cleared) used by both card painting and the detail modal.
S11. Deduplicate the categories/tags/revision write statements in the items repository.
S12. Remove `openCardDetails` (duplicate of `activateCardKey`).
S13. `App.tsx` dialogs use one `activeDialog` state instead of six booleans; stable Navbar callbacks.
S14. Split `ItemForm` into per-kind field components; behavior unchanged.
S15. Trim task-history comments ("T9 carried follow-up" style) to the "why"; fix misplaced `wrapText` doc comment.
User wording: "me gustaria que apliques todas las correcciones ... al finalizar tu trabajo, quede listo para subir a remote en caso que lo apruebe."

## Tasks
T0 — pre-existing canvas perf + review gaps — inline — done — commit 05fc6d3.
T1 — S2,S3,S4,S5,S11 — delegated (writer A, API surface; parallel with T2/T3) — done; RED 4×500 "too many SQL variables" at 130 matches → GREEN; API suite 235/235 — commits cfdc7e3 (index, Risk item 1), aba6d9e.
T2 — S1,S6,S7,S8,S12 (+S9 engine half) — delegated (writer B, canvas surface; parallel) — done; RED card-texture-keys 4/5, engine-frame 3 → GREEN; test/canvas 355/355 — commit 962cebb. Note: canvas in-card VideoPlayback is dormant (no app caller since d9278f4).
T3 — S9,S10,S13,S14 — delegated (writer C, web app surface; parallel) — done; RED 8 new hook/endpoint tests + missing load-font module → GREEN; 308/308 scoped web tests — commits 553c394 (ItemForm split), 13a8972. Risk item 3 (modal callback signatures; App is the only caller).
T4 — S15 — delegated (writer D; context backstop, touches every surface, comments only) — done; comment-only diff filter clean (3 CSS block-comment lines) — commit 48930d6.
T5 — seam check + independent verification (S2/S3/S5 touch persisted schema: Risk item 1/3) — seam check passed (shared 83, api 235, web 761; typecheck, biome 0 errors, web build); independent verifier: S1–S5, S11 PASS by baseline differential; S9 blocker fixed — commit 7a512f2.

## Log
L1. User (2026-11-07): "se ha trabajando en unas optimizaciones para el proyecto. me gustaria que las revises" → follow-up: "cierres las mini brechas ... y tambien que busques formas de optimizar mas el proyecto ya sea con optimizaciones de arquitectura o limpieza de codigo espagueti etc." → "empieza por la que creas conveniente. igual me gustaria que apliques todas las correcciones. te dejare trabajando por tu cuenta y confiare en tu criterio ... al finalizar tu trabajo, quede listo para subir a remote en caso que lo apruebe. ... usa las herramientas que necesites y lanza los subagentes que creas conveniente"
L2. Audit (read-only explorer) produced 14 findings + comment cleanup; parent spot-checked S1 (cards.ts:207,275). Heavy tests deferred by owner to another instance; run focused tests here. RDD globally off → no native review.
L3. Routing: three disjoint surfaces (apps/api; apps/web/src/canvas except card-painters.ts; apps/web app/forms/detail/api/hooks + card-painters.ts) each with several minutes of work → parallel writers in the same tree, parent owns git.
L4. Independent verifier (baseline d9278f4 vs candidate, scratch copies): S2 28 filter queries × 3 visibility modes byte-identical pages/cursors, 250-match combined filter pages (baseline 500); S3 boundary #3c0000 in / #3D0000 out; S4/S11 28 write steps identical status/body/DB state; S5 migration additive, drizzle-kit reports no schema drift; S1 keys bounded by LRU. Blocker S9: save after failed initial load only patched locally (status stayed error). Advisories: capped list grew to 401; legacy short hex decodes to 0 (out of domain, writes validate #RRGGBB); every px of resize repainted textures.
L5. One correction batch (7a512f2): applySavedItem refetches unless phase is loaded; capped list keeps its length; texture size keys bucketed to 16px. RED 3 new tests → GREEN; web suite 764/764; test/items + test/canvas 384/384; typecheck + biome clean. Recheck limited to the blocker = the new "recovers with a full refetch when a save follows a failed load" test reproducing the verifier probe.
L6. Remaining follow-ups (not in scope): canvas in-card VideoPlayback is dormant code since d9278f4; ItemDetailModal keeps its own focus-trap instead of useDialogFocusTrap; visibleCardInstances still builds a cell-key string per frame; Vite chunk-size warning on the web build. Branch has no upstream; push/PR are the owner's decision. Real-browser/GPU performance proof is deferred to the owner's larger instance.
L7. User (2026-11-07): "elimina el codigo de reproducir video dentro de una card" → 0eaa2f3 removes VideoPlayback, CardLayer live-texture path, u_videoAspect shader branch, orphan .canvas-host__playback CSS (263 lines deleted). Web suite 757/757 (7 playback-only tests removed), typecheck, biome, build pass.
