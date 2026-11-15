---
name: inspiration-garden
description: "Trigger: inspiration garden, garden items, find inspiration, save to the garden, tag or re-tag items, clean up tags. Query and curate the garden through its REST API."
license: UNLICENSED
metadata:
  author: "trinity-bytes"
  version: "1.0"
---

## Activation Contract

Load when the user wants to find, read, add, edit, tag, or clean up items in their Inspiration Garden, or names `GARDEN_API_URL` / the garden API.

## Hard Rules

- Base URL is `$GARDEN_API_URL`; reads are public. Writes send `Authorization: Bearer $GARDEN_API_TOKEN` (a `read + write` token). Never print, echo, or log the token.
- Never page through the whole garden. Every list call MUST narrow with at least one of `q`, `tag`, `kind`, `categoryId`, `color`, and MUST pass `fields` and a `limit` of 20 or less.
- Scan with `fields=title,url,tags` (or `kind,title,tags`); fetch `GET /api/items/:id` only for the few items you need in full.
- Follow `nextCursor` only when the user needs more results than one page.
- `PATCH /api/items/:id` MUST send the item's current `kind`; `tags` replaces the whole list, so send existing tags plus new ones.
- Reuse existing tag names from `GET /api/tags`; create a new tag only when none fits.
- Before any write touching more than one item, or any delete or tag rename/merge, show the planned changes and wait for confirmation.

## Decision Gates

| Need | Call |
|------|------|
| Know the vocabulary | `GET /api/tags` (name + count), `GET /api/categories` |
| Find by words | `GET /api/items?q=word1 word2&fields=...&limit=20` (prefix match, all words, any order) |
| Find by facet | `tag=` (repeat = AND), `kind=` (repeat = OR), `categoryId=`, `color=#hex` |
| Full item | `GET /api/items/:id` |
| Add | `POST /api/items` |
| Edit or re-tag | `PATCH /api/items/:id` with `kind` |
| Rename or merge a tag | `PATCH /api/tags/:id` `{"name":"..."}` (merges into an existing name) |
| Remove | `DELETE /api/items/:id` (to trash), `DELETE /api/tags/:id` |

## Execution Steps

1. Check `GARDEN_API_URL` is set; for writes also check `GARDEN_API_TOKEN` is set (without printing it).
2. Load `GET /api/tags` once when the request involves topics or tags.
3. Run the narrowest list call; widen filters only if it returns nothing.
4. For writes, build the payload from the item's current state, confirm per the rules, then send.
5. Re-read changed items with `fields=` to confirm the result.

## Output Contract

Return a compact list: title, URL (when present), tags, and item id. For writes, list each item changed and what changed; report failures with the API's `error.code`.

## References

- `references/recipes.md` — copy-ready curl recipes, the re-tag workflow, and item kinds.
