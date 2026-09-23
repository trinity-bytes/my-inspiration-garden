# API: ingestion endpoints (T6)

Base URL: the deployed Worker origin. Auth: owner (Access session) or a
`write`-scope bearer token, unless noted otherwise. See `apps/api/src/http/routes`
for the full implementation.

## Media

- `POST /api/media` — multipart upload (`file` field). Accepts `image/jpeg`,
  `image/png`, `image/webp`, `image/gif`, `image/avif`, `video/mp4`,
  `video/webm`, validated by magic bytes (not the declared content type).
  Size caps per kind: 15 MB images / 50 MB video by default, tunable via the
  `MAX_IMAGE_BYTES`/`MAX_VIDEO_BYTES` wrangler vars. Stores the file in R2
  under `media/<yyyy>/<mm>/<uuid>.<ext>`. Returns `{ r2Key, mime, size }`.
- `GET /api/media/*key` — public, no auth. Streams the object from R2 with
  `Cache-Control: public, max-age=31536000, immutable` and an `ETag`; 404 if
  the key doesn't exist.
- `POST /api/media/import { url }` — fetches a remote image on the server's
  behalf and stores it the same way as a direct upload (used to persist link
  preview images so they survive the source page disappearing). `url` must
  be `http`/`https` and not resolve to a loopback/private/link-local host or
  IP literal; the fetch has a 10s timeout and a manual byte cap while
  streaming (the response's `Content-Length` is never trusted); the
  downloaded content is revalidated by magic bytes.

## Link unfurl

- `POST /api/unfurl { url }` — returns
  `{ url, canonicalUrl?, title?, description?, siteName?, platform, previewImage?, author?, embed? }`.
  `platform` is detected from the hostname
  (`dribbble` | `pinterest` | `x` | `behance` | `youtube` | `vimeo` | `other`).
  Tries oEmbed first for platforms that have one (YouTube, Vimeo, X,
  Pinterest); otherwise fetches the page HTML (capped at 512 KB, same URL
  safety/timeout rules as media import) and extracts Open Graph / Twitter
  card / `<title>` / meta description / `link[rel=canonical]` via
  `HTMLRewriter`, resolving relative image URLs against the page URL. Never
  throws on partial metadata — returns whatever it found.

## Palette / color indexing

- Palette extraction itself runs client-side (`extractPalette` in
  `packages/shared/src/palette.ts`) since Workers can't decode images
  cheaply; the API only indexes what the client sends.
- When an `image` item's `data.palette` (an array of hex strings or
  `{ hex, weight }` objects) or a `palette` item's `data.colors` is present
  on create/update, the API populates `item_colors` for that item
  (`ItemsRepository`), fully replacing the previous set on every update
  (including a revision restore). `GET /api/items?color=#RRGGBB` matches
  against these rows.
