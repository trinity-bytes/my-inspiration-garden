# Overline labels use the documented Overline text style

Written against: 06442e8

Status: Figma updated (pending owner approval). Implement only after every design fix is approved in Figma.

## Evidence chain

- Surface: `apps/web` item detail modal (kind label above the title) and the item form palette fieldset (Quick add / Edit item modals, palette kind).
- Problem: Uppercase 12px overline labels drift from the Overline style. The item detail kind label renders at weight 500 with `0.02em` tracking; the item form palette legend sets no weight (browser default 400 for `legend`) and `0.02em` tracking. The filter panel group legends already render 12px / 600 / `0.04em`.
- Design evidence: Figma "Inspiration Garden — UI (current state)", file `tX6gKvasJmMovsbC3KBiWU`:
  - Text style "Overline": Geist SemiBold (600), 12px, letter-spacing 4% (`0.04em`), used with upper case.
  - Screen "Item detail — Link · Owner" (`7:305`): kind label `7:341` uses the Overline style.
  - Screen "Quick add — Palette · Owner" (`10:499`), added for this fix: the "Colors" legend `10:634` uses the Overline style.
- Tokens: `apps/web/src/styles/tokens.css` defines `--font-size-xs: 0.75rem` and `--font-weight-heading: 600`; there is no token for `0.04em` (`--tracking-label` is `0.02em`, which matches the Figma Label/MD style, not Overline).
- Owner:
  - `apps/web/src/detail/ItemDetailModal.css` → `.item-detail__kind-label` (rendered at `apps/web/src/detail/ItemDetailModal.tsx:368`)
  - `apps/web/src/forms/ItemForm.css` → `.item-form__palette legend` (rendered at `apps/web/src/forms/ItemForm.tsx:386`)
  - `apps/web/src/filters/FilterPanel.css` → `.filter-panel__group legend` (already correct values, raw)
- Scope and affected surfaces: those three rules plus one new token.
- Uncertainty: none.

## Design decision

Every overline label renders with the Figma Overline style: 12px, SemiBold (600), `0.04em` tracking, upper case. Add one token for the Overline tracking so the three consumers share it instead of repeating a raw value.

## Reuse

- `--font-size-xs` (12px)
- `--font-weight-heading` (600)
- New: `--tracking-overline: 0.04em` in `tokens.css`, next to `--tracking-label`. Justification: Figma defines a distinct Overline tracking (4%) that `--tracking-label` (2%) cannot express, and three rules consume it.
- Exemplar: `apps/web/src/filters/FilterPanel.css` → `.filter-panel__group legend` (already renders the target values).

## Changes

1. `apps/web/src/styles/tokens.css`
   - Change: add `--tracking-overline: 0.04em;` directly after `--tracking-label: 0.02em;`.
   - Preserve: every existing token.
   - Verify: the token resolves to `0.04em`.

2. `apps/web/src/detail/ItemDetailModal.css` → `.item-detail__kind-label`
   - Change: `font-weight: var(--font-weight-label);` → `font-weight: var(--font-weight-heading);` and `letter-spacing: var(--tracking-label);` → `letter-spacing: var(--tracking-overline);`.
   - Preserve: `font-size: var(--font-size-xs)`, `text-transform: uppercase`, `color: var(--color-text-muted)`, `display: inline-block`.
   - Verify: the kind label (for example "LINK") renders 12px / 600 / `0.04em`, matching Figma `7:341`.

3. `apps/web/src/forms/ItemForm.css` → `.item-form__palette legend`
   - Change: `font-size: 0.75rem;` → `font-size: var(--font-size-xs);`, add `font-weight: var(--font-weight-heading);`, and `letter-spacing: var(--tracking-label);` → `letter-spacing: var(--tracking-overline);`.
   - Preserve: `text-transform: uppercase`, `color: var(--color-text-muted)`, `margin-bottom: var(--space-2)`.
   - Verify: with the palette kind selected, the "COLORS" legend matches Figma `10:634`.

4. `apps/web/src/filters/FilterPanel.css` → `.filter-panel__group legend`
   - Change: `font-size: 0.75rem;` → `var(--font-size-xs)`, `font-weight: 600;` → `var(--font-weight-heading)`, `letter-spacing: 0.04em;` → `var(--tracking-overline)`.
   - Preserve: rendered result is identical (same values, now tokenized).
   - Verify: filter panel legends look unchanged.

## Scope

- Inherit: item detail kind label; item form palette legend (Quick add and Edit item); filter panel group legends.
- Verify: no visual change in the filter panel.
- Exclude:
  - `apps/web/src/tokens/TokensModal.css` → `.tokens-modal__scope`: an inline accent-colored scope tag, not a section overline.
  - The "Categories" legend in `ItemForm.tsx:525`: not uppercase, styled as a field label.
  - Other raw `rem` font sizes: covered by the separate off-ramp font sizes fix.

## Validation

- Product: open an item detail, Quick add with the palette kind, and the filter panel; the three overline labels share one style.
- Interface: desktop and phone width; long kind labels stay on one line.
- System: the three rules consume `--font-size-xs`, `--font-weight-heading`, `--tracking-overline`; no raw overline values remain.
- Repository: `mise exec -- pnpm lint` → passes; `mise exec -- pnpm typecheck` → passes; `mise exec -- pnpm test` → passes.

## Stop conditions

- Stop if the Figma Overline style changes before implementation.
- Stop if either selector no longer exists or no longer renders an uppercase label.

## Design documentation

- Figma already records the Overline style; the "Quick add — Palette · Owner" screen (`10:499`) was added for this fix.
