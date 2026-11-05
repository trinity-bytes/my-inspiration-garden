# UI v2 from the approved Figma review

Objective: implement every approved Figma fix (F1–F11) in `apps/web`. Branch `feat/ui-v2` from `main` (HEAD `06442e8`). Delivery: `ask-on-risk`; forecast well over 400 authored lines, so ask for the chain strategy before the second commit. Runner: Vitest 4 (`mise exec -- pnpm test`, `mise exec -- pnpm typecheck`, `mise exec -- pnpm lint`); visual validation with Playwright (global install, see Log).

## Specs

Source of truth: Figma file `tX6gKvasJmMovsbC3KBiWU`, page "Proposals" (`16:609`) and page "Components"; tracker `design-plans/figma-review.md` (IDs, node IDs, Log L1–L8). Owner requests, verbatim (typos normalized in the tracker):

- S1 (F1) Overline labels use the Overline style: 12px, 600, `0.04em`, uppercase. Detailed plan: `design-plans/overline-weight.md`.
- S2 (F3) Every font size is on the scale (`--font-size-xs|sm|md|lg|xl`). Map: 0.8rem → xs; 0.85–0.9rem → sm; `.filter-panel__title` 1rem → md. Button SM label is 14px (Label/SM). Owners: `CategoryManagerModal.css:40`, `TokensModal.css:8,43,49,92`, `ItemForm.css:14,21,98`, `FilterPanel.css:23,31,64,89`, `RevisionHistoryModal.css:32`.
- S3 (F9) "hay un casi nulo uso de iconos, no todo debe comunicarse con palabras." Icons: `lucide-react@1.63.0` (ISC, matches Figma's `lucide-static@1.63.0`). Icon Button (Neutral/Accent/Danger × default/hover/focus/disabled), Tooltip; every icon-only control has an `aria-label` and a tooltip. Figma: Components `25:57`, Icon Button `25:184`, Tooltip `25:193`.
- S4 (F10) Controls v2: Button v2 (icon + label, Accent/Secondary/Danger × MD/SM) `32:230`, Select v2 `31:191`, Dropdown Menu `31:193`, Checkbox v2 (on/off/mixed) `31:260`, Field v2 (icon, helper, error) `31:302`, Chip v2 (toggle/removable/static) `31:322`.
- S5 (F5) "el navbar carece de comunicación, todo parece lo mismo agrupado con el mismo espaciado" / "el navbar es innecesariamente largo, la barra de búsqueda ocupa más espacio del que necesita. además el 'inspiration garden' es innecesario de mostrar." Desktop navbar v2: no wordmark, compact centered pill, Search Bar with Filters inside (`28:165`, divider + active-count badge), icon buttons with tooltips. Figma `26:163`.
- S6 (F4) "la vista móvil no tiene navbar cuando el usuario está logueado" / "hay una gran similitud entre el ícono de filtro y el ícono de hamburguesa". Mobile (≤480px) one 48px row: search bar (Filters inside), Add (accent), account menu (`circle-user-round`, not ☰) holding management actions and Sign out last after a divider. Figma `26:567`.
- S7 (F6) "en las vistas detalladas no todos los botones clickeables tienen colores que indiquen eso". Item detail: 36px icon buttons Edit, History; Move to trash (Danger) next to Close ✕; static tags/categories become soft 6px rectangles, muted, `#` prefix; preview image gets an "Open ↗" badge. Figma `16:645`.
- S8 (F7) "en móvil las cards se ven demasiado separadas". `COLUMN_GUTTER_PX` 28 → 12 below 480px viewport (one constant per viewport, horizontal and vertical); desktop keeps 28. Owner: `apps/web/src/canvas/column-layout.ts:31`, consumers in `item-layout.ts`. Figma `19:743`.
- S9 (F11) Modals v2 (close moves to a header ✕, no footer Close): Trash (+ empty state "Items you move to the trash show up here."), Revision history, Confirm destructive (danger icon tile at 16% tint, Danger action with icon), API tokens, Categories (row icon actions, always visible on touch), Filter panel v2 (kind toggle chips with icons, category checkbox tree with mixed state, tag chips with counts, color swatches), Add item (kind select with icons, image field error "Required for image items.", styled Upload picker). Figma `33:1016`.
- S10 (F2) Canvas message pill and loading message use the glass surface with an icon (muted for empty, danger for error, progress ring for loading). Figma `36:1560`.
- S11 (F8) Mobile (≤480px): dialogs open as sheets with a grab handle, scrim, 16px side padding. Full-height (top 56px, inner scroll): item detail, Add/Edit item, Categories, API tokens (create form stacked). Bottom sheet sized to content: Filter panel, Trash, Revision history, Confirm. Filters keep applying live (no "Show results" button, L7). Figma `39:831`.
- S12 Behavior, data and API are unchanged; this is presentation only. Existing tests keep passing.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S2 tokens + font scale | inline | done | `feat/ui-type-scale` f8a0d4d |
| T2 | S3 lucide-react, IconButton, Tooltip | inline | done | `feat/ui-icon-system` 04fa8bc |
| T3 | S4 controls v2 | inline | done | `feat/ui-controls-v2` 55c2773 |
| T4 | S5, S6 navbar v2 desktop + mobile account menu | inline | done | `feat/ui-navbar-v2` c4fd5da |
| T5 | S7 item detail | inline | done | `feat/ui-item-detail` ce4c782 |
| T6 | S9 modals v2 + filter panel v2 + item form | inline | done | `feat/ui-modals-v2` 04f765d, f4b6bf8, 7822032, d4baaa8, 3f645a1 |
| T7 | S10 canvas messages + loading | inline | done | `feat/ui-canvas-messages` 5eb1f5b |
| T8 | S8 mobile gutter (TDD on the constant) | inline | done (RED 5 failing → GREEN) | `feat/ui-mobile-gutter` d41dbb7 |
| T9 | S11 mobile sheets | inline | done | `feat/ui-mobile-sheets` da47169 |
| T10 | S1–S12 Playwright screenshots at 1280×800 and 390×844, compared with Figma | inline | done | screenshots per task (scratchpad) |

Risk notes: T2 adds a dependency (high-risk item 5) — pin the exact version, own commit. T8 changes layout logic — test first.

## Log

- L1 (2026-10-28, owner): "cualquier cambio o corrección primero quiero que la hagas en figma" / "solo al final cuando todo quede aprobado se procederá con la implementación".
- L2 (2026-10-29, owner): "aprovado, la siguiente sesion procedemos con la implementacion. dejalo todo listo. ademas instala playwright para que tengas las herramientas necesarias para que puedas validar tus avances por tu cuenta. dejalo instalado global para que otros proyectos lo puedan usar" (typos normalized).
- 2026-10-29: All fixes F1–F11 approved (tracker L6–L8). Figma proposals were not promoted into the Components/Screens pages; Proposals is the implementation reference.
- 2026-10-29: Playwright installed globally: `playwright@1.64.1` and `@playwright/mcp@0.0.83` (npm global under mise node 26.12.1), Chromium revisions 1247/1248 in `~/.cache/ms-playwright`, MCP server `playwright` registered at user scope (`playwright-mcp --browser chromium --headless --isolated`). Launch blocked until the system libraries are installed with sudo: `sudo "$(which node)" "$(npm root -g)/playwright/cli.js" install-deps chromium`, then re-run the smoke test (launch chromium, `setContent`, read `h1`) (missing libnss3, libnspr4, libgbm, libxkbcommon, …).
- 2026-10-29: Owner installed the system deps; smoke test passes (`ok 156.0.8078.4`), the MCP Chromium (rev 1247) has no missing libraries.
- L3 (2026-10-29, owner): "te voy a dejar trabajando por tu cuenta, quedan a tu criterio las decisiones. lo único que te pido es: 0 prs, cada feature en su propia rama, conventional commit full inglés y minúscula, y buen gusto" (typos normalized).
- 2026-10-29: Delivery per L3: no PRs; one branch per task, stacked (each branches from the previous because later features reuse earlier components): `feat/ui-type-scale` → `feat/ui-icon-system` → `feat/ui-controls-v2` → `feat/ui-navbar-v2` → `feat/ui-item-detail` → `feat/ui-modals-v2` → … Commit messages are lowercase Conventional Commits, no AI attribution (user CLAUDE.md).
- 2026-10-29: Decisions: native `<select>` kept (Figma Select v2 says "native-select look"); the custom Dropdown Menu is used for the phone account menu only. Tooltips are CSS-only (`styles/tooltip.css`), hidden on touch; `tooltipAlign="end"` keeps them inside dialogs. Item detail opens focused on Close (not Edit/Trash). Danger text on glass uses new token `--color-danger-text`.
- 2026-10-29: Visual harness: `vite --port 5199` + Playwright script with mocked `/api/*` (scratchpad, not committed). Navbar v2 and item detail checked at 1280×800 and 390×844 against Figma.
- 2026-10-29: T6–T9 done. Extra fixes found while validating: ConfirmDialog is portaled to `<body>` (a parent glass dialog's `backdrop-filter` trapped its fixed backdrop inside the parent, on desktop too); dead cartoon tokens (`--surface-*`) removed once F2 shipped; revision/token dates use the medium date style shown in Figma; item form fieldsets lost the native frame; palette rows became a grid (they overflowed at 16px inputs).
- 2026-10-29: Verification: `pnpm test` → shared 78, api 210, web 643 passed; `pnpm typecheck` and `pnpm lint` pass; `pnpm --filter @garden/web build` passes (pre-existing >500 kB chunk warning, three.js). Every screen compared with Figma at 1280×800 and 390×844.
- Not done / follow-ups: swipe-down-to-close on phone sheets (Figma F8 note) is not implemented, ✕ and scrim/Escape close them; the filter sheet has no scrim on purpose (results stay visible while filters apply live, L7); Figma Proposals were not promoted into Components/Screens.
- Next step: owner review of the stacked branches; merge order follows the chain (no PRs, per L3).
