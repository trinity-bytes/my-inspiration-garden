# Solid dark background, cartoon surfaces, faster navigation

## Objective

Replace the sky/cloud background with a solid dark color, replace glassmorphism with a solid cartoon style, and raise the maximum navigation speed by 1.5x.

## Problem

In real use the sky and cloud background goes unnoticed: it neither draws attention nor adds to the experience. The translucent glass surfaces no longer fit. Navigation feels slow when crossing the garden.

## Why

Owner feedback after using production v0.1.0 (2026-10-03).

## Scope

- In:
  - Canvas: remove the sky, haze and cloud layers and their textures; the canvas clears to a solid dark color. Remove now-unused modules, shaders, tests and `public/images` assets (`sky`, `cloud-1..4`).
  - CSS fallback: `.canvas-host` uses the same solid dark color instead of the sky image.
  - Loading screen: drop the landscape photo (`landscape-1280/2560`) for the same solid dark color, for consistency with "no sky imagery".
  - Surfaces: replace glass tokens and every `backdrop-filter` with a solid cartoon style: opaque cream surface, thick dark border, hard offset shadow (no blur), generous radius. Applies to navbar, filter panel, detail modal, form modals, the canvas message pill, the loading message and other glass-shadow users.
  - Speed: `DEFAULT_MAX_SPEED` 760 → 1140 and `DEFAULT_KEYBOARD_SPEED` 840 → 1260.
- Out: dark-mode text palette (panels stay light, so existing text colors stay); WebGL card visuals (no glass there).

## Constraints

- Branch `feat/solid-cartoon-style` from `main` (independent of `fix/link-preview-r2`). Work-unit commits local; push/PR are the owner's call.
- TDD on (source: explicit user choice, 2026-09-23; see `garden-mvp.md`). Runner: Vitest 4. Commands: `mise exec -- pnpm test`, `mise exec -- pnpm typecheck`, `mise exec -- pnpm lint`. TDD applies to extractable logic (speed constants, background color); pure styling is checked by build and visual readback.
- Centralize the new look in `apps/web/src/styles/tokens.css` (surface, border, offset shadow, background color tokens).
- RDD: off (global). Delivery: forecast ~400–600 authored lines, mostly deletions of the sky/cloud stack; single PR, cohesive visual change.

## Decisions

- Panel style: **light solid surfaces with thick dark border and hard offset shadow** (owner, 2026-10-03).
- Speed: **1.5x** — cursor 1140, keyboard 1260 (owner, 2026-10-03).
- Loading screen photo removed too (orchestrator, follows the owner's "no sky imagery").

## Tasks

| ID | Task | Route | Status |
|----|------|-------|--------|
| S1 | Speed: raise max cursor and keyboard speeds 1.5x (test first) | delegated | [x] |
| S2 | Background: remove sky/haze/cloud layers, shaders, helpers, tests and assets; solid dark clear color; CSS fallback and loading screen use the same color | delegated | [ ] |
| S3 | Surfaces: replace glass tokens and `backdrop-filter` with solid cartoon tokens across all affected components | delegated | [ ] |

Route evidence: S2 and S3 each touch 2+ non-trivial files (writer trigger); one writer handles S1–S3 sequentially.

## Acceptance criteria

- No sky, cloud or landscape imagery is requested or shipped; the canvas and loading screen show a solid dark background.
- No `backdrop-filter` or translucent glass tokens remain; panels are opaque with a thick border and hard offset shadow.
- Max cursor speed 1140 and keyboard speed 1260.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Progress

- 2026-10-03: Mapping done, owner decided style and speed; feature document created. Next: S1.
- 2026-10-03: S1 done. RED (expected 1140, got 760) then GREEN, navigation-controller tests 20/20. Commit 463c4ce.
