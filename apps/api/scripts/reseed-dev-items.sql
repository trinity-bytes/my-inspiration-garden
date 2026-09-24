-- Dev-only local reseed (T9 scope D). Run against the LOCAL D1 database
-- only, never remote:
--   pnpm exec wrangler d1 execute inspiration-garden --local --file=scripts/reseed-dev-items.sql
-- (from apps/api). Operates directly on SQLite via `wrangler d1 execute`
-- (not the HTTP API), so it needs no DEV_OWNER_BYPASS / .dev.vars and
-- cannot disturb an already-running `wrangler dev`/owner session — it only
-- touches the shared local D1 file both a running dev server and this
-- command read/write from the same `apps/api` working directory. The
-- items_fts5 triggers on `items` keep the search index in sync
-- automatically; item_colors (color filtering, T10 scope) is NOT
-- refreshed by this script — a documented gap, out of scope here.
--
-- Origin: the local D1 image items seeded during T8b's visual QA used the
-- canvas's own alpha-sprite cloud textures (transparent) and, for one
-- text item, a body-truncated (not word-wrapped) title — both now fixed.

-- --- image: repoint transparent cloud-sprite items at real, already- ---
-- --- uploaded opaque photos (landscape/sky derivatives, T8b's local  ---
-- --- R2 state) instead of fetching new assets. Only two distinct     ---
-- --- opaque source photos exist in the repo (landscape, sky) — reused ---
-- --- across a few differently-titled/cropped-sounding entries rather ---
-- --- than fabricated variety that doesn't exist in-repo.             ---
UPDATE items SET
  title = 'Ridge at golden hour',
  data = '{"r2Key":"media/2026/09/93041ab7-bdc7-42a8-b324-f5520ecb9e08.webp","width":1280,"height":720,"mime":"image/webp","alt":"Warm-lit mountain ridgeline at dusk"}',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'ebdbcf2b-602c-4a26-8519-0cc7552fb211';

UPDATE items SET
  title = 'Hazy horizon study',
  data = '{"r2Key":"media/2026/09/737da92b-2323-437f-b93a-758c49a9ae97.webp","width":3548,"height":1774,"mime":"image/webp","alt":"Soft gradient sky in dusk tones"}',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'f10fc334-9827-43c9-bc9c-c64d317d1488';

UPDATE items SET
  title = 'Wide valley vista',
  data = '{"r2Key":"media/2026/09/3667ebe5-5edd-4f32-a6cc-ee941d581871.webp","width":2560,"height":1439,"mime":"image/webp","alt":"Broad landscape vista at golden hour"}',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'b88fadd7-655c-4bb7-88d7-08b3c2d4cfcb';

-- Redundant once the above three are repointed (a literal duplicate r2Key
-- of another item, and a same-photo-different-resolution near-duplicate) —
-- removed rather than kept as further copies of the same two photos, so
-- the image kind lands at 5 genuinely distinct-looking entries.
DELETE FROM items WHERE id IN (
  '785f87a5-c350-4fb7-9e4a-c2be93f25c02', -- "Cloud layer detail" (transparent)
  '77e4ecf5-801c-4107-991e-29d28fda668d', -- "Second cloud reference" (transparent, dup r2Key)
  '3a4c5e9c-e72f-4452-a45b-2e567a10f6f2'  -- "Landscape sketch small" (same photo as the repointed items above)
);

-- --- link: the two items that had a previewImage pointed at the same ---
-- --- transparent cloud sprites — repoint to opaque photos so the T9  ---
-- --- link card's photo-background composite (and detail view preview) ---
-- --- render correctly. The other two link items already have no      ---
-- --- preview, covering "links with and without preview" either way.  ---
UPDATE items SET
  data = json_set(data, '$.previewImage', '/api/media/media/2026/09/93041ab7-bdc7-42a8-b324-f5520ecb9e08.webp'),
  updated_at = CURRENT_TIMESTAMP
WHERE id = '27211369-0325-484d-8a71-ae14b94736f1'; -- Dribbble shot

UPDATE items SET
  data = json_set(data, '$.previewImage', '/api/media/media/2026/09/737da92b-2323-437f-b93a-758c49a9ae97.webp'),
  updated_at = CURRENT_TIMESTAMP
WHERE id = '646ef312-cde1-4f66-ac48-3c620fcc5236'; -- Pinterest pin

-- --- text: fix the one bad seed title (this was the actual origin of ---
-- --- the "titles are hard-clipped" T9 bug report — the SEEDED title  ---
-- --- itself was a body prefix truncated mid-word, not a rendering    ---
-- --- bug; wrap-text.ts now handles real long titles/bodies correctly ---
-- --- regardless). Body is left as-is (still a good long-body case).  ---
UPDATE items SET
  title = 'Notes on text card wrapping',
  updated_at = CURRENT_TIMESTAMP
WHERE id = '42aac0d6-64cc-47ae-9a81-ea817de61a38';

-- --- palette: bring every palette into the requested 4-6 color range ---
-- --- (two were seeded with only 3).                                  ---
UPDATE items SET
  data = '{"colors":[{"hex":"#F29A6B"},{"hex":"#E0784E"},{"hex":"#FCE3D3"},{"hex":"#FFB088"},{"hex":"#2A2140"}]}',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'e6744dc6-be07-48b2-954e-f8ff050da00d'; -- Apricot accent (3 -> 5)

UPDATE items SET
  data = '{"colors":[{"hex":"#2A2140"},{"hex":"#F6F3FA"},{"hex":"#8F7BB5"},{"hex":"#5E4C82"},{"hex":"#D5CBE8"}]}',
  updated_at = CURRENT_TIMESTAMP
WHERE id = '9b9b6309-0a99-4fa1-b099-4c31cea37692'; -- Ink & sky (3 -> 5)

-- --- font: give one item a real, loadable sourceUrl (a stable jsDelivr ---
-- --- CDN static font file) so the FontFace-loads-successfully path is  ---
-- --- exercised, not just the Geist-fallback path every existing font   ---
-- --- item (none had a sourceUrl at all) was stuck on. The commercial   ---
-- --- foundry item deliberately keeps no sourceUrl (product decision:   ---
-- --- never upload/link commercial font files) and Geist keeps none     ---
-- --- either (baseline no-URL case) — between the three, every font-    ---
-- --- card code path (loads live, no URL at all) is covered.            ---
UPDATE items SET
  data = json_set(data, '$.sourceUrl', 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff2'),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'fd1e8802-7b1f-4afb-bb83-de1323b9f2e0'; -- Inter

-- --- video: only 2 existed (both embedUrl-only, no thumbnail — neither ---
-- --- exercised the canvas card's "thumbnail + play glyph" path nor the ---
-- --- detail view's thumbnail-fallback path). Add two more.             ---
INSERT INTO items (id, kind, title, url, notes, data, source, created_at, updated_at)
VALUES (
  'a3b1e6c2-9b0a-4b4e-8a7a-2f6f7e2d5c11',
  'video',
  'Behind the scenes — cut together',
  'https://example.com/videos/behind-the-scenes.mp4',
  NULL,
  '{"provider":"file","thumbnail":"/api/media/media/2026/09/3667ebe5-5edd-4f32-a6cc-ee941d581871.webp"}',
  'web',
  '2026-01-02T00:00:00.000Z',
  '2026-01-02T00:00:00.000Z'
);

INSERT INTO items (id, kind, title, url, notes, data, source, created_at, updated_at)
VALUES (
  'c5d2f8a4-3e7b-4a1c-9d6e-8b1a4f0c7e22',
  'video',
  'Conference talk — motion design panel',
  NULL,
  NULL,
  '{"provider":"youtube","embedUrl":"https://www.youtube.com/embed/example2","thumbnail":"/api/media/media/2026/09/93041ab7-bdc7-42a8-b324-f5520ecb9e08.webp"}',
  'web',
  '2026-01-02T00:00:00.000Z',
  '2026-01-02T00:00:00.000Z'
);
