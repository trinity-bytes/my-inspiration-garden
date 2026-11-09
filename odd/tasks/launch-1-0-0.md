# Launch 1.0.0

Objective: official public launch — faster pan, README rework, tidy Figma with a Cover page, then release v1.0.0.
Branch: `develop` → `main`. Delivery: single release, work-unit commits. Test runner: vitest (`mise exec -- pnpm test`).

## Specs

- S1: "incrementes la velocidad maxima de desplazamiento en un 30%" — cursor drift max speed 1710 → 2223; keyboard speed 1890 → 2457 (assumption: keyboard scales with it, as in every previous speed change).
- S2: "hagas un rework del readme para que refleje el estado actual del proyecto con imagenes y esas cosas".
- S3: "ordenes el figma y dejes en una pagina 'cover' la miniatura para figma, el social preview al compartir la web y la imagen preview del repo de github".
- S4: "del figma quita todas las propuestas descartadas y deja fundations components y screens bien actualizados".
- S5: "una vez hecho todo eso sacaremos la release 1.0.0 con github release y todo".

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1 | inline | [x] RED (expected 1710 to be 2223) → GREEN, canvas tests 351 pass | 2e8dcdb |
| T2 | S3, S4 | inline (Figma) | [x] Cover + Foundations/Components/Screens; Proposals deleted | see Log |
| T3 | S2 | inline | [x] README + docs/images; lint/typecheck/tests pass | see Log |
| T4 | S5 | inline | [x] v1.0.0 released, deploy run 42544687999 success | 0af7ffe |

## Log

- L1 (2026-11-08, owner): "al fin el repo es publico. para hacer oficial el lanzamiento quiero que incrementes la velocidad maxima de desplazamiento en un 30%, hagas un rework del readme para que refleje el estado actual del proyecto con imagenes y esas cosas, ordenes el figma y dejes en una pagina 'cover' la miniatura para figma, el social preview al compartir la web y la imagen preview del repo de github. del figma quita todas las propuestas descartadas y dej en lasy deja fundations components y screens bien actualizados. una vez hecho todo eso sacaremos la release 1.0.0 con github release y todo"
- 2026-11-08: T2 — Figma file `tX6gKvasJmMovsbC3KBiWU`: Cover page (thumbnail 1920×960, OG 1200×630, GitHub 1280×640); shipped proposals promoted, discarded ones deleted, Proposals page removed; F8 phone sheets fixed to bottom navbar; tokens match `tokens.css`. The Plugin API cannot set the file thumbnail (`setFileThumbnailNodeAsync` unsupported) and GitHub has no API for the repo social preview: both are owner steps.
- 2026-11-08: T3 — README rewritten with production screenshots (Playwright + headless Chromium against inspo.jahattrinidad.com) in `docs/images/`. Full suite: shared 87, API 244, web 770; typecheck and lint pass (3 pre-existing warnings).
- 2026-11-08: T4 — GitHub release v1.0.0 (main 0af7ffe); deploy workflow passed, `/api/health` ok, production bundle carries the new speed (2223).
