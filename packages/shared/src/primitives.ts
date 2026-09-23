import { z } from "zod";
import { normalizeTag } from "./helpers";

/** Crockford base32 ULID (26 chars, first char restricted to 0-7). */
const ulidRegex = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/** Accepts either a ULID or a UUID so ids stay stable across future id strategies. */
export const idSchema = z.union([z.string().regex(ulidRegex, "must be a valid ULID"), z.uuid()]);

/** ISO-8601 timestamp, stored as text in D1 and serialized as-is over the API. */
export const isoDateTimeSchema = z.iso.datetime();

/** Where an item/mutation originated. Agents identify themselves as `agent:<name>`. */
export const sourceSchema = z.union([
  z.enum(["web", "extension", "pwa", "api"]),
  z.string().regex(/^agent:[a-zA-Z0-9_-]+$/, "must look like agent:<name>"),
]);

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a #RRGGBB hex color");

/** Free-form tags: normalized (trim + lowercase), deduplicated, empty strings dropped. */
export const tagsSchema = z
  .array(z.string())
  .default([])
  .transform((tags) => {
    const normalized = tags.map(normalizeTag).filter((tag) => tag.length > 0);
    return Array.from(new Set(normalized));
  });
