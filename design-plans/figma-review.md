# Figma-first UI review

Figma file `tX6gKvasJmMovsbC3KBiWU` ("Inspiration Garden — UI (current state)"). Every fix is designed in Figma first; code changes start only after the owner approves all of them. Proposals live on the Figma page "Proposals" (current vs proposed, side by side).

## File layout (since v1.0.0, 2026-11-08)

The "Proposals" page is gone: every shipped proposal was promoted and every discarded option deleted. Pages:

- **Cover** — Figma thumbnail (1920×960, `103:3933`), social preview (Open Graph 1200×630, `103:3881`, same as `apps/web/public/og-image.png`) and GitHub repository preview (1280×640, `103:3907`, exported to `docs/images/github-social-preview.png`).
- **Foundations** — tokens (`2:12`) and Brand (`104:3094`: App Icon master `88:3686`, sizes, lockup).
- **Components** — Canvas Card, Skeleton Card, Navbar v2 (`104:2939`, Role × Device), Filter Panel (`104:2940`), Icons & navigation controls, Controls (v2), Tags & link button, Item Note.
- **Screens** — sections Desktop · Home (`104:829`), Desktop · Item detail & forms (`104:830`), Desktop · Dialogs (`104:831`), Phone · 390 (`104:832`).

The node IDs in the history below that point at the Proposals page no longer exist.

## Resume here (paused 2026-10-29)

1. Re-open the Figma file and the "Proposals" page (`16:609`); sections top to bottom: F6 detail, F5 navbar v2, F4 mobile navbar v2, F7 mobile gutter, Modals v2, F8 mobile states.
2. F8 approved (L7). Every fix is approved (L8). Next session: implementation.
3. Done: F8 mobile states — item detail (full-screen sheet), filter panel (bottom sheet), Add/Edit item, Trash/Categories/Tokens/History/Confirm on a 390px phone. Reuse Components: Icon Button `25:184`, Search Bar `28:165`, Button v2 `32:230`, Select v2 `31:191`, Dropdown Menu `31:193`, Checkbox v2 `31:260`, Field v2 `31:302`, Chip v2 `31:322`, Tooltip `25:193`; glass dialog paint from Screens `7:465`.
4. Still open: F3 (off-ramp font sizes) has no Figma work yet; the canvas card spacing (F7) and overline (F1) need formal approval.
5. After every fix is approved: promote proposals into Components (replace Button/Chip/Navbar/Field) and Screens, write one plan per fix in this folder (template: improve-ui `references/plan-template.md`), then implement. Code is untouched so far (HEAD `06442e8`).

Notes: icons are Lucide `lucide-static@1.63.0` (ISC), fetched from `https://unpkg.com/lucide-static@1.63.0/icons/<name>.svg`; for code use the matching `lucide-react` version. Icon-only controls need an `aria-label` and a tooltip. This folder is untracked in git (not committed).

## Fixes

| ID | Fix | Figma | Plan | Status |
|----|-----|-------|------|--------|
| F1 | Overline labels use the Overline text style | Screens `10:499` (Quick add — Palette) | `overline-weight.md` | Figma done, awaiting approval |
| F2 | Cartoon surface residue (canvas message pill, loading message) → glass pills with icons | Proposals `36:1560` | — | Figma done, awaiting approval |
| F3 | Off-ramp font sizes: every text uses the 12/14/16/20/24 scale. Figma: Button v2 SM label 13px → Label/SM 14px (SM heights 28/30 → 30/32). Code map: 0.8rem meta/revoked/copied/palette label/tag → `--font-size-xs`; 0.85–0.9rem intro/error/field/option/clear/move → `--font-size-sm`; filter title 1rem → `--font-size-md`; item-detail owner-action text goes away (icon buttons, F6) | Components `32:230` | — | Figma done, awaiting approval |
| F4 | Mobile owner navbar state (missing) + menu — v2 icon-first single row | Proposals `26:567` | — | Owner liked the direction (L5); formal approval pending |
| F5 | Navbar v2: no wordmark, compact centered pill, compact search, icon buttons + tooltips | Proposals `26:163` | — | Owner liked the direction (L5); formal approval pending |
| F6 | Item detail: clickable controls look clickable (root: Button Secondary SM = Chip Meta, identical paint) | Proposals `16:610` | — | Figma done, awaiting approval |
| F7 | Mobile canvas: cards too far apart (gutter 28 → 12 below 480px) | Proposals `19:743` | — | Figma done, awaiting approval |
| F9 | Icon system: Lucide 1.63 (ISC) icons, Icon Button (Neutral/Accent/Danger × states, icon swap), Search Field (compact), Search Bar with Filters inside `28:165`, Tooltip | Components `25:57` | — | Figma done, awaiting approval |
| F10 | Controls v2: Select (icon + chevron, open), Dropdown Menu, Checkbox (on/off/mixed), Field v2 (icon, helper, error), Chip v2 (toggle/removable/static), Button v2 (icon + label) | Components `31:144` | — | Approved (L6) |
| F11 | Modals v2: Trash (+empty), Revision history, Confirm (destructive), API tokens, Categories, Filter panel, Add item (kind menu open, image + validation error); close moves to header ✕ | Proposals `33:1016` | — | Approved (L6) |
| F8 | Missing mobile states: item detail + forms + Categories + API tokens as full-height sheets; filter panel, Trash, History, Confirm as bottom sheets (grab handle, scrim, 16px gutter) | Proposals `39:831` | — | Approved (L7) |
| F12 | Link preview image: upload, paste and remove (no image, uploading, image set, upload failed, phone) | Proposals `51:2194` | — | Approved (L9); shipped in v0.10.0 |
| F13 | Canvas keyboard focus cue: 1px accent hairline at 30%, desktop only, no cue on phones | Proposals `51:3008` | — | Approved (L9); shipped in v0.10.0 |
| F14 | Image description and visible notes: Description field on image items; Item Note block (`57:212`, Icon/sticky-note `56:2785`) in the item detail for every kind, below the description, hidden when empty; form hints "What the image shows." and "Why you saved it, in your own words." | Proposals `57:2787` | — | Approved (L11) |
| F16 | Skeleton loading: skeleton cards on the real masonry grid replace the full-screen spinner; navbar visible from the first frame; one sheen band across the canvas; per-card cross-fade reveal; first load only | Proposals `68:3061`, Components (Skeleton Card `68:3075`), Screens (`72:3316`, `72:3366`) | — | Approved (L13); shipped in v0.13.0 |
| F17 | Social preview image: 1200×630 Open Graph/Twitter card with the Bloom mark, name, tagline and sample Canvas Cards (no third-party images). Tagline approved (L16): "A personal space of resources, curated by me, for me." A Centered `75:3286`, C Bloom `83:3597` rejected (L17); D Cards `88:3709` chosen (L18): staggered real Canvas Cards, dark center card with white type and the chosen mark left of the name as a horizontal lockup (L19) | Proposals `75:3279` | — | Approved (L20); shipped in v0.14.0 |
| F18 | App icon v2: replaces the Bloom (F15) with a mark made of rounded cards. A Masonry `88:3650`, B Four cards `88:3686` chosen (L18) | Proposals `88:3642` | — | Approved (L18); shipped in v0.14.0 |

## Log

- L1 (2026-10-28, owner): "cualquier cambio o corrección primero quiero que la hagas en figma" / "solo al final cuando todo quede aprobado se procederá con la implementación".
- L2 (2026-10-29, owner): "no está mostrando la interfaz en todos sus estados aún. por ejemplo la vista móvil no tiene navbar cuando el usuario está logueado. y faltan otras opciones. además el navbar carece de comunicación, todo parece lo mismo agrupado con el mismo espaciado. otra cosa es que en las vistas detalladas no todos los botones clickeables tienen colores que indiquen eso, que son clickeables. y en móvil las cards se ven demasiado separadas" (typos normalized).
- Code evidence (HEAD 06442e8):
  - Navbar: one flex row, `gap: var(--space-4)` between every item; Filters is the only accent button; owner actions are four identical secondary pills; ≤480px only wraps (`flex-wrap`) with search on its own row (`Navbar.css`).
  - Item detail owner actions: `border: 1px solid var(--color-border)` on a translucent fill, `0.8rem`, no hover state, "Move to trash" not danger-colored (`ItemDetailModal.css:58-77`).
  - Canvas gutter: `COLUMN_GUTTER_PX = 28` on every viewport (`canvas/column-layout.ts:31`); 2 columns below 480px.
- 2026-10-29: Proposals page `16:609` created with current vs proposed for F4–F7. Proposals use instance overrides; after approval the Button (stronger Secondary) and Chip (static Meta) components and the Screens page get updated, then plans are written.
- L3 (2026-10-29, owner): "hay un casi nulo uso de iconos, no todo debe comunicarse con palabras. otra cosa, el navbar es innecesariamente largo, la barra de búsqueda ocupa más espacio del que necesita. además el 'inspiration garden' es innecesario de mostrar." (typos normalized)
- 2026-10-29: Icon library chosen: Lucide (no icons existed in code). Navbar proposals replaced by v2 (F4/F5); item detail proposal (F6) moved to icon buttons with a Danger tone for Move to trash.
- L4 (2026-10-29, owner): "en el navbar, especialmente el móvil, hay una gran similitud entre el ícono de filtro y el ícono de hamburguesa que indica el menú. habría que manejarlo de tal forma que se entienda que son diferentes o pertenecen a usos diferentes" (typos normalized)
- 2026-10-29: Filters moved inside the search field (Search Bar component, hairline divider, active count badge); the mobile menu became an account menu with the circle-user-round icon instead of ☰.
- L5 (2026-10-29, owner): "mucho mejor. me gusta cómo lo resolviste. ahora quiero ver cómo quedarían el resto de elementos, las listas desplegables, los checkbox, el resto de modales, etc." (typos normalized)
- 2026-10-29: Controls v2 + Button v2 on Components; Modals v2 section on Proposals. New copy proposed (not in code): trash empty subline "Items you move to the trash show up here." and the image field message "Required for image items."
- L6 (2026-10-29, owner): "aprobado, pasa a las versiones mooviles" — approves Controls v2 (F10), Modals v2 (F11) and the two new copy lines; F8 mobile states started.
- 2026-10-29: F8 built on Proposals (`39:831`): 9 phones (390×844) with the owner navbar v2 behind a scrim. Full-height sheets (top 56px): item detail, Add item (Link, kind menu open), Add item (Image, error), Categories, API tokens (create form stacks vertically). Bottom sheets sized to content: Filter panel, Trash, Revision history, Confirm. Also fixed the Confirm danger icon tile (was red-on-red; now danger at 16% opacity) on desktop and mobile.
- L7 (2026-10-29, owner): "va. aprobado" — approves F8, filters on mobile keep applying live (no "Show results" button).
- 2026-10-29: F3 designed. Audit of Modals v2 + F8: only Button v2 SM used an off-scale size (13px), now Label/SM. Canvas card text in phone backdrops is scaled artwork, out of scope.
- L8 (2026-10-29, owner): "aprovado, la siguiente sesion procedemos con la implementacion. dejalo todo listo." — approves F1, F2, F3, F4, F5, F6, F7, F9.
- 2026-11-04: Both changes were coded before Figma, so F12 and F13 sync them after the fact. Numbered F12/F13 because F9/F10 labels on the Proposals page already differ from this table.
- L9 (2026-11-04, owner): "aprobado. y de paso actualiza la pagina de screens, qu etiene el navbar aun en la parte superior" — approves F12 and F13.
- 2026-11-04: Screens page (`1:3`): all six frames now use Navbar v2 at the bottom edge (F9); the filter panel in `5:547` is Filter panel v2 rising above the bar. Dialogs on Screens and the old Navbar on Components are not promoted yet.
- 2026-11-04: F12 extended with Image item paste (`55:2665`); the owner asked to add it to Figma and implement it directly. Shipped in v0.10.1.
- L10 (2026-11-04, owner): "va, entonces necesito que las imagenes puedan tener descripcion. y ademas una forma de ver las notas tambien" (typos normalized).
- 2026-11-04: F14 built on Proposals (`57:2787`). Notes were stored and indexed for search but rendered nowhere; item reads are public, so visibility of notes is an open owner decision.
- L11 (2026-11-04, owner): "aprobado" — approves F14 with notes visible to every visitor.

## F10 · Phone canvas (shipped v0.8, 2026-10-29)

Code first, Figma synced after (motion/shader work can't be designed in Figma). Proposals section `47:2121`, phone `47:2201`: 2.4 columns below 480px (156px cards, 12px gutter, third column peeks), cards never grow/shrink at edges (desktop too, v0.8.1), 40px fade on phones, lens measured on the shorter side. Supersedes F7's two exact columns.
- L12 (2026-11-05, owner): "me gustaria cambiar la animacion de carga por un skeletton. prepara una propuesta en figma".
- 2026-11-05: F16 built on Proposals (`68:3061`). Code evidence: `LoadingScreen` covers the viewport at z-index 40 and clears on the engine's first rendered frame (`fireReady`, `engine.ts`), not on `itemsStatus`, so the canvas sits empty until the fetch ends. `useGardenItems` only reports "loading" on the first load, so refetches never show the skeleton. The real canvas bends under the barrel lens, so the skeleton should be painted by the engine, not a flat DOM overlay.
- L13 (2026-11-05, owner): "aprobado. trabaja por tu cuenta en la imolementacion ynencargate de subirlo a prod. usa oas herramientas que mecedites." — approves F16 and authorizes shipping it.
- 2026-11-05: Figma synced with v0.13.0: F16 copy and Visitor bars match what shipped, Skeleton Card moved to Components, Home — Loading frames added to Screens, old loading pill removed from Canvas messages (`36:1557`; it survives in F16's Before frame).
- L14 (2026-11-05, owner): "si. primero figma" — design the social preview image in Figma before the metadata, canonical and robots.txt work.
- L15 (2026-11-05, owner): "me gusta el centrado. pero el tagline es muy generivo, inspiration gsrden es un espacio personal donde recokecto recursis curados por mi y pensados para ser ysados poe mi."
- L16 (2026-11-05, owner): "si. pero aun asi el diseño se siente simple" — tagline approved; composition needs more character.
- L17 (2026-11-05, owner): "no, ese giant bloom me hizo ver wue el bloom no pertenece a este diseño. osea, la interfaz es un csnvas infiniro de cards cuadradas, no hsy curculos flotando. por lo tanto, creo que hsu que cambiar el logo y por consiguiente el diseño del giant bloom que creo que tenis potencisl pero con csrds en lugar de circulos"
- L18 (2026-11-05, owner): "me gusta el A pero me quedo con el B porque funciona mejor en tamaños pequeños. pero si, me quedo con la D tambien pero ese azul sobre naranja al centro es poco legible en tamaños peuqueños"
- L19 (2026-11-05, owner): "pon el icono ao lado ixquierdo del nombre en un layout tipo isologotipo y creo que queda"
- L20 (2026-11-05, owner): "queda. aprobado"
- L21 (2026-11-08, owner): "ordenes el figma y dejes en una pagina 'cover' la miniatura para figma, el social preview al compartir la web y la imagen preview del repo de github. del figma quita todas las propuestas descartadas y deja fundations components y screens bien actualizados."
- 2026-11-08: Done for v1.0.0. Cover page added; shipped proposals promoted to Screens (F8 phone sheets got Navbar v2 at the bottom edge, per F9) and Components (Navbar v2, Filter Panel); v1 Navbar, Filter Panel and unused v1 controls removed; Proposals page deleted. Variables re-checked against `tokens.css`: no drift.
