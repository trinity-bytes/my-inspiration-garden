import { z } from "zod";
import { normalizeTag } from "./helpers";
import {
  hexColorSchema,
  idSchema,
  isoDateTimeSchema,
  sourceSchema,
  tagsSchema,
} from "./primitives";

export const itemKindSchema = z.enum(["image", "link", "text", "video", "palette", "font"]);
export type ItemKind = z.infer<typeof itemKindSchema>;

/**
 * Every per-kind `data` schema uses `z.looseObject` (passthrough) so extra,
 * forward-compatible keys written by newer clients/agents survive a round trip
 * instead of being stripped or rejected.
 */

/**
 * A palette entry is either a plain hex string (legacy/simple form) or an
 * object carrying an explicit weight (from client-side `extractPalette`,
 * `packages/shared/src/palette.ts`). Both forms are normalized by
 * `normalizePalette` before the API indexes `item_colors`.
 */
export const paletteEntrySchema = z.union([
  hexColorSchema,
  z.looseObject({ hex: hexColorSchema, weight: z.number().min(0).max(1).optional() }),
]);

export const imageDataSchema = z.looseObject({
  r2Key: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mime: z.string().min(1),
  alt: z.string().optional(),
  description: z.string().optional(),
  palette: z.array(paletteEntrySchema).optional(),
  dominantColor: hexColorSchema.optional(),
});

export const linkPlatformSchema = z.enum([
  "dribbble",
  "pinterest",
  "x",
  "behance",
  "youtube",
  "vimeo",
  "other",
]);
export type LinkPlatform = z.infer<typeof linkPlatformSchema>;

export const linkDataSchema = z.looseObject({
  siteName: z.string().optional(),
  platform: linkPlatformSchema.optional(),
  /** Either a remote URL or an R2 key; ingestion decides which one it stored. */
  previewImage: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
});

export const textDataSchema = z.looseObject({
  body: z.string().min(1),
});

export const videoProviderSchema = z.enum(["youtube", "vimeo", "file"]);

export const videoDataSchema = z.looseObject({
  provider: videoProviderSchema,
  embedUrl: z.string().optional(),
  r2Key: z.string().optional(),
  thumbnail: z.string().optional(),
});

export const paletteColorSchema = z.looseObject({
  hex: hexColorSchema,
  name: z.string().optional(),
  /**
   * Relative proportion of this color within the palette (T11b B5, owner
   * decision 2026-09-26): any positive number, not required to sum to 1 or
   * 100 across the palette's colors — `normalizePalette`
   * (`packages/shared/src/palette.ts`) rescales proportionally against
   * whatever the other colors carry. Omitted for backward compatibility with
   * pre-B5 items, which fall back to an even split.
   */
  weight: z.number().positive().optional(),
});

export const paletteDataSchema = z.looseObject({
  colors: z.array(paletteColorSchema).min(1).max(16),
});

export const fontProviderSchema = z.enum(["google", "fontshare", "foundry", "other"]);
export const fontLicenseSchema = z.enum(["free", "commercial", "unknown"]);

export const fontDataSchema = z.looseObject({
  family: z.string().min(1),
  sourceUrl: z.string().optional(),
  provider: fontProviderSchema.optional(),
  license: fontLicenseSchema.optional(),
  previewText: z.string().optional(),
  specimenImage: z.string().optional(),
});

const itemCore = {
  id: idSchema,
  title: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
  source: sourceSchema,
  categoryIds: z.array(idSchema).default([]),
  tags: tagsSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.optional(),
};

export const imageItemSchema = z.object({
  ...itemCore,
  kind: z.literal("image"),
  url: z.url().optional(),
  data: imageDataSchema,
});

export const linkItemSchema = z.object({
  ...itemCore,
  kind: z.literal("link"),
  // Link items always carry the source URL; every other kind treats it as optional.
  url: z.url(),
  data: linkDataSchema,
});

export const textItemSchema = z.object({
  ...itemCore,
  kind: z.literal("text"),
  url: z.url().optional(),
  data: textDataSchema,
});

export const videoItemSchema = z.object({
  ...itemCore,
  kind: z.literal("video"),
  url: z.url().optional(),
  data: videoDataSchema,
});

export const paletteItemSchema = z.object({
  ...itemCore,
  kind: z.literal("palette"),
  url: z.url().optional(),
  data: paletteDataSchema,
});

export const fontItemSchema = z.object({
  ...itemCore,
  kind: z.literal("font"),
  url: z.url().optional(),
  data: fontDataSchema,
});

export const itemSchema = z.discriminatedUnion("kind", [
  imageItemSchema,
  linkItemSchema,
  textItemSchema,
  videoItemSchema,
  paletteItemSchema,
  fontItemSchema,
]);
export type Item = z.infer<typeof itemSchema>;

const generatedFields = { id: true, createdAt: true, updatedAt: true, deletedAt: true } as const;

export const createItemInputSchema = z.discriminatedUnion("kind", [
  imageItemSchema.omit(generatedFields),
  linkItemSchema.omit(generatedFields),
  textItemSchema.omit(generatedFields),
  videoItemSchema.omit(generatedFields),
  paletteItemSchema.omit(generatedFields),
  fontItemSchema.omit(generatedFields),
]);
export type CreateItemInput = z.infer<typeof createItemInputSchema>;

/**
 * Update payloads are a top-level partial of the create shape, with `kind`
 * forced back to a required literal so it stays immutable and still
 * discriminates which per-kind `data` shape applies. `data`, when present,
 * must be the *complete* object for that kind (not deep-partial) so a partial
 * update never leaves a kind's `data` in an inconsistent shape.
 */
export const updateItemInputSchema = z.discriminatedUnion("kind", [
  imageItemSchema
    .omit(generatedFields)
    .partial()
    .extend({ kind: z.literal("image") }),
  linkItemSchema
    .omit(generatedFields)
    .partial()
    .extend({ kind: z.literal("link") }),
  textItemSchema
    .omit(generatedFields)
    .partial()
    .extend({ kind: z.literal("text") }),
  videoItemSchema
    .omit(generatedFields)
    .partial()
    .extend({ kind: z.literal("video") }),
  paletteItemSchema
    .omit(generatedFields)
    .partial()
    .extend({ kind: z.literal("palette") }),
  fontItemSchema
    .omit(generatedFields)
    .partial()
    .extend({ kind: z.literal("font") }),
]);
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>;

function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function toOptionalBoolean(value: unknown): unknown {
  if (value === undefined || typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

export const itemListQuerySchema = z.object({
  kind: z.preprocess(toArray, z.array(itemKindSchema)).default([]),
  tag: z.preprocess(toArray, z.array(z.string().transform(normalizeTag))).default([]),
  categoryId: z.preprocess(toArray, z.array(idSchema)).default([]),
  color: hexColorSchema.optional(),
  q: z.string().trim().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  includeDeleted: z.preprocess(toOptionalBoolean, z.boolean().optional()),
  /** T11: lists exclusively soft-deleted items (the trash view). Gated the same as `includeDeleted`. */
  deletedOnly: z.preprocess(toOptionalBoolean, z.boolean().optional()),
});
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
