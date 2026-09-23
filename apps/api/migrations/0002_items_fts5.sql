-- Hand-written migration: drizzle-kit cannot model SQLite virtual tables, so
-- the FTS5 index and its sync triggers are written directly.
--
-- Design notes:
--   * `items.id` is a TEXT ULID, not an INTEGER rowid, so this table cannot
--     use FTS5 "external content" mode (which requires an integer
--     content_rowid). Instead it is a standalone FTS5 table keyed by an
--     UNINDEXED `id` column and kept in sync explicitly by the triggers
--     below (delete-then-insert on update).
--   * `body` covers both the `text` kind's `data.body` and the `link` kind's
--     `data.description`, pulled straight out of the JSON `data` column with
--     `json_extract` so no extra denormalized column is needed for it.
--   * `tags` is populated from `items.search_text` (a denormalized,
--     space-joined list of tag names) instead of joining `item_tags`/`tags`
--     inside the trigger. Tags live in a many-to-many join table, so syncing
--     them via triggers on `item_tags` would require aggregating every tag
--     row for the item on each change (harder to get right and slower per
--     write). The repository layer instead keeps `items.search_text` current
--     whenever `item_tags` changes for that item, and these triggers just
--     read it -- the simpler, robust option called out in the task.
--   * Soft-deleted items are NOT removed from the index here: the item still
--     exists (it is in the trash, not gone), so search results are filtered
--     by joining back to `items` and checking `deleted_at IS NULL`, the same
--     way any other item query excludes trashed rows.
CREATE VIRTUAL TABLE `items_fts` USING fts5(
	`id` UNINDEXED,
	`title`,
	`notes`,
	`body`,
	`tags`
);
--> statement-breakpoint
CREATE TRIGGER `items_fts_after_insert` AFTER INSERT ON `items` BEGIN
	INSERT INTO `items_fts` (`id`, `title`, `notes`, `body`, `tags`)
	VALUES (
		new.id,
		coalesce(new.title, ''),
		coalesce(new.notes, ''),
		coalesce(json_extract(new.data, '$.body'), json_extract(new.data, '$.description'), ''),
		coalesce(new.search_text, '')
	);
END;
--> statement-breakpoint
CREATE TRIGGER `items_fts_after_update` AFTER UPDATE ON `items` BEGIN
	DELETE FROM `items_fts` WHERE `id` = old.id;
	INSERT INTO `items_fts` (`id`, `title`, `notes`, `body`, `tags`)
	VALUES (
		new.id,
		coalesce(new.title, ''),
		coalesce(new.notes, ''),
		coalesce(json_extract(new.data, '$.body'), json_extract(new.data, '$.description'), ''),
		coalesce(new.search_text, '')
	);
END;
--> statement-breakpoint
CREATE TRIGGER `items_fts_after_delete` AFTER DELETE ON `items` BEGIN
	DELETE FROM `items_fts` WHERE `id` = old.id;
END;
