import type { Item, ItemKind } from "@garden/shared";

const BASE = {
  source: "web" as const,
  categoryIds: [] as string[],
  tags: [] as string[],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const DATA_DEFAULTS: Record<ItemKind, Record<string, unknown>> = {
  image: { r2Key: "media/x.png", width: 800, height: 600, mime: "image/png" },
  link: {},
  text: { body: "hello world" },
  video: { provider: "youtube" },
  palette: { colors: [{ hex: "#ff0000" }] },
  font: { family: "Inter" },
};

const URL_DEFAULTS: Partial<Record<ItemKind, string>> = {
  link: "https://example.com/post",
};

/**
 * Minimal, valid item fixture for one of the 6 kinds. Not run through the
 * shared Zod schema (tests only need the shape); callers override `title`,
 * `data`, or any other field via `extra`.
 */
export function makeItem(
  id: string,
  kind: ItemKind = "text",
  dataOverrides: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): Item {
  return {
    ...BASE,
    id,
    kind,
    title: `Item ${id}`,
    url: URL_DEFAULTS[kind],
    data: { ...DATA_DEFAULTS[kind], ...dataOverrides },
    ...extra,
  } as Item;
}
