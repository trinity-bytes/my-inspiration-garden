# Garden API recipes

Set once per shell: `export GARDEN_API_URL=https://your-garden.example.com` and, for writes, `export GARDEN_API_TOKEN=ig_...`. Full machine-readable spec: `GET $GARDEN_API_URL/api/openapi.json`.

## Read

```sh
# Tag vocabulary, most used first
curl -s "$GARDEN_API_URL/api/tags" | jq -r '.tags | sort_by(-.count)[] | "\(.count)\t\(.name)"'

# Words: every word must match, as a prefix, in any field and order
curl -s -G "$GARDEN_API_URL/api/items" --data-urlencode "q=landing hero" \
  -d fields=title,url,tags -d limit=20

# Facets: tags are AND, kinds are OR
curl -s "$GARDEN_API_URL/api/items?tag=portfolio&tag=animations&kind=link&kind=image&fields=kind,title,url,tags&limit=20"

# Next page only when needed
curl -s -G "$GARDEN_API_URL/api/items" -d tag=portfolio -d fields=title,tags -d limit=20 \
  --data-urlencode "cursor=$NEXT_CURSOR"

# One full item
curl -s "$GARDEN_API_URL/api/items/$ID"
```

`fields` accepts: `id kind title url notes data source categoryIds tags createdAt updatedAt deletedAt` (comma list or repeated; `id` is always returned).

## Write (needs `GARDEN_API_TOKEN`)

```sh
AUTH=(-H "Authorization: Bearer $GARDEN_API_TOKEN" -H "Content-Type: application/json")

# Add a link: unfurl first (POST /api/items does not fetch metadata), then create.
# A remote previewImage is copied into the garden's storage on create.
META=$(curl -s -X POST "$GARDEN_API_URL/api/unfurl" "${AUTH[@]}" -d '{"url":"https://example.com"}')
jq -n --argjson m "$META" '{kind:"link", url:$m.url, title:$m.title, tags:["web-reference"],
  data:({siteName:$m.siteName, platform:$m.platform, previewImage:$m.previewImage,
         description:$m.description, author:$m.author} | with_entries(select(.value != null)))}
  | with_entries(select(.value != null))' \
  | curl -s -X POST "$GARDEN_API_URL/api/items" "${AUTH[@]}" -d @-

# Add a text note
curl -s -X POST "$GARDEN_API_URL/api/items" "${AUTH[@]}" \
  -d '{"kind":"text","title":"Idea","data":{"body":"..."},"tags":["inspiration"]}'

# Replace an item's tags (kind must match the item)
curl -s -X PATCH "$GARDEN_API_URL/api/items/$ID" "${AUTH[@]}" \
  -d '{"kind":"link","tags":["portfolio","animations"]}'

# Rename a tag; an existing name merges both
curl -s -X PATCH "$GARDEN_API_URL/api/tags/$TAG_ID" "${AUTH[@]}" -d '{"name":"web-reference"}'
```

Item kinds: `image`, `link`, `text`, `video`, `palette`, `font`. Images and videos are uploaded through `POST /api/media` first (see the OpenAPI spec).

## Re-tag workflow

1. `GET /api/tags` to learn the existing vocabulary.
2. List candidates narrowly, e.g. items with few tags in one topic: `q=<topic>&fields=kind,title,url,tags&limit=20`.
3. For each candidate, read only what you need (`title`, `url`, and `GET /api/items/:id` for `data.description` or `notes`).
4. Propose a table: id, title, current tags, tags to add or remove. Prefer existing tags.
5. After confirmation, `PATCH` each item with `kind` and the full new tag list; report each result.

## Tag cleanup

- Unused tags: `GET /api/tags` entries with `count` 0; delete with `DELETE /api/tags/:id` after confirmation.
- Near-duplicates (`web-ref` vs `web-reference`): rename the minor one to the major name with `PATCH /api/tags/:id`, which merges their items.
