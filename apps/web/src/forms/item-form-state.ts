import type {
  CreateItemInput,
  Item,
  ItemKind,
  LinkPlatform,
  UpdateItemInput,
} from "@garden/shared";
import { normalizePalette } from "@garden/shared";

export type VideoProvider = "youtube" | "vimeo" | "file";
export type FontProvider = "google" | "fontshare" | "foundry" | "other";
export type FontLicense = "free" | "commercial" | "unknown";

export interface TextFormData {
  body: string;
}

export interface LinkFormData {
  siteName?: string;
  platform?: LinkPlatform;
  previewImage?: string;
  description?: string;
  author?: string;
}

export interface ImageFormData {
  r2Key?: string;
  width?: number;
  height?: number;
  mime?: string;
  alt?: string;
  description?: string;
  palette?: { hex: string; weight?: number }[];
}

export interface VideoFormData {
  provider: VideoProvider;
  embedUrl?: string;
  r2Key?: string;
  thumbnail?: string;
}

export interface PaletteColorInput {
  hex: string;
  name?: string;
  /** Relative proportion of this color (T11b B5) — see `paletteColorSchema` in `packages/shared/src/item.ts`. */
  weight?: number;
}

export interface PaletteFormData {
  colors: PaletteColorInput[];
}

export interface FontFormData {
  family: string;
  sourceUrl?: string;
  provider?: FontProvider;
  license?: FontLicense;
  previewText?: string;
}

/**
 * One form state shape shared by quick-add and edit (T11): a field per kind
 * plus the common title/url/notes/tags/categories. Only the block matching
 * `kind` is read by {@link buildCreateItemInput}/{@link buildUpdateItemInput}
 * — the others are kept around so switching the kind selector in the quick-add
 * UI doesn't lose already-typed data.
 */
export interface ItemFormState {
  kind: ItemKind;
  title: string;
  url: string;
  notes: string;
  tags: string[];
  categoryIds: string[];
  text: TextFormData;
  link: LinkFormData;
  image: ImageFormData;
  video: VideoFormData;
  palette: PaletteFormData;
  font: FontFormData;
}

export type BuildItemInputResult<T> = { ok: true; input: T } | { ok: false; error: string };

export function createEmptyFormState(kind: ItemKind): ItemFormState {
  return {
    kind,
    title: "",
    url: "",
    notes: "",
    tags: [],
    categoryIds: [],
    text: { body: "" },
    link: {},
    image: {},
    video: { provider: "youtube" },
    palette: { colors: [] },
    font: { family: "" },
  };
}

/** Prefills a form state from an existing item, for the edit modal (T11). */
export function formStateFromItem(item: Item): ItemFormState {
  const state = createEmptyFormState(item.kind);
  state.title = item.title ?? "";
  state.url = item.url ?? "";
  state.notes = item.notes ?? "";
  state.tags = [...item.tags];
  state.categoryIds = [...item.categoryIds];

  switch (item.kind) {
    case "text":
      state.text = { body: item.data.body };
      break;
    case "link":
      state.link = { ...item.data };
      break;
    case "image":
      state.image = {
        ...item.data,
        palette: item.data.palette ? normalizePalette(item.data.palette) : undefined,
      };
      break;
    case "video":
      state.video = { ...item.data };
      break;
    case "palette":
      state.palette = {
        colors: item.data.colors.map((c) => ({ hex: c.hex, name: c.name, weight: c.weight })),
      };
      break;
    case "font":
      state.font = { ...item.data };
      break;
  }

  return state;
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/**
 * The web client never sets `source` — the API computes and overrides it
 * server-side from the actor/`X-Garden-Client` header (`computeItemSource`,
 * `apps/api/src/http/routes/items.ts`) — so the create payload this module
 * builds omits it, matching {@link createItem}'s signature in
 * `apps/web/src/api/endpoints.ts`.
 */
export type CreateItemFormInput = Omit<CreateItemInput, "source">;

/** Builds a create-item payload from form state, or a human-readable validation error. */
export function buildCreateItemInput(
  state: ItemFormState,
): BuildItemInputResult<CreateItemFormInput> {
  const title = state.title.trim();
  const notes = state.notes.trim();
  const common = {
    title: title.length > 0 ? title : undefined,
    notes: notes.length > 0 ? notes : undefined,
    categoryIds: state.categoryIds,
    tags: state.tags,
  };

  switch (state.kind) {
    case "text": {
      const body = state.text.body.trim();
      if (body.length === 0) return fail("Text body is required.");
      const url = state.url.trim();
      return {
        ok: true,
        input: { ...common, kind: "text", url: url.length > 0 ? url : undefined, data: { body } },
      };
    }
    case "link": {
      const url = state.url.trim();
      if (url.length === 0) return fail("A url is required for a link item.");
      return { ok: true, input: { ...common, kind: "link", url, data: { ...state.link } } };
    }
    case "image": {
      const { r2Key, width, height, mime, alt, palette } = state.image;
      const description = state.image.description?.trim() || undefined;
      if (!r2Key || !width || !height || !mime) {
        return fail("Upload an image before saving.");
      }
      return {
        ok: true,
        input: {
          ...common,
          kind: "image",
          data: { r2Key, width, height, mime, alt, description, palette },
        },
      };
    }
    case "video": {
      const { provider, embedUrl, r2Key, thumbnail } = state.video;
      if ((provider === "youtube" || provider === "vimeo") && !embedUrl?.trim()) {
        return fail("An embed url is required for a youtube/vimeo video.");
      }
      if (provider === "file" && !r2Key) {
        return fail("Upload a video file before saving.");
      }
      const url = state.url.trim();
      return {
        ok: true,
        input: {
          ...common,
          kind: "video",
          url: url.length > 0 ? url : undefined,
          data: { provider, embedUrl, r2Key, thumbnail },
        },
      };
    }
    case "palette": {
      if (state.palette.colors.length === 0) {
        return fail("Add at least one color to a palette item.");
      }
      return {
        ok: true,
        input: { ...common, kind: "palette", data: { colors: state.palette.colors } },
      };
    }
    case "font": {
      const family = state.font.family.trim();
      if (family.length === 0) return fail("A font family name is required.");
      return {
        ok: true,
        input: { ...common, kind: "font", data: { ...state.font, family } },
      };
    }
  }
}

/** Builds an update-item payload from form state, keeping `kind` immutable (T11 edit). */
export function buildUpdateItemInput(state: ItemFormState): BuildItemInputResult<UpdateItemInput> {
  const created = buildCreateItemInput(state);
  if (!created.ok) return created;
  // `UpdateItemInput` is a top-level partial of the create shape with `kind`
  // forced back to a required literal, and drops `source` entirely
  // (packages/shared/src/item.ts). The create payload omits empty fields, but
  // an omitted field keeps its stored value on update, so each emptied field
  // becomes `null` to clear it. `url` only applies to kinds whose payload
  // carries it: the other forms have no url field to empty.
  const { input } = created;
  return {
    ok: true,
    input: {
      ...input,
      title: input.title ?? null,
      notes: input.notes ?? null,
      ...("url" in input ? { url: input.url ?? null } : {}),
    } as UpdateItemInput,
  };
}
