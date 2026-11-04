import type { Item } from "@garden/shared";
import { describe, expect, it } from "vitest";
import {
  buildCreateItemInput,
  buildUpdateItemInput,
  createEmptyFormState,
  formStateFromItem,
} from "../../src/forms/item-form-state";

describe("createEmptyFormState", () => {
  it("returns a blank form for the given kind with no categories/tags", () => {
    const state = createEmptyFormState("text");
    expect(state.kind).toBe("text");
    expect(state.categoryIds).toEqual([]);
    expect(state.tags).toEqual([]);
    expect(state.text.body).toBe("");
  });

  it("defaults the video provider to youtube", () => {
    expect(createEmptyFormState("video").video.provider).toBe("youtube");
  });
});

describe("buildCreateItemInput", () => {
  it("rejects a text item with an empty body", () => {
    const state = createEmptyFormState("text");
    const result = buildCreateItemInput(state);
    expect(result.ok).toBe(false);
  });

  it("builds a valid text item input", () => {
    const state = createEmptyFormState("text");
    state.title = "My note";
    state.tags = ["ui", "nature"];
    state.categoryIds = ["cat-1"];
    state.text.body = "hello garden";

    const result = buildCreateItemInput(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toMatchObject({
        kind: "text",
        title: "My note",
        tags: ["ui", "nature"],
        categoryIds: ["cat-1"],
        data: { body: "hello garden" },
      });
    }
  });

  it("rejects a link item without a url", () => {
    const state = createEmptyFormState("link");
    const result = buildCreateItemInput(state);
    expect(result.ok).toBe(false);
  });

  it("builds a valid link item input from unfurl-prefilled fields", () => {
    const state = createEmptyFormState("link");
    state.url = "https://dribbble.com/shots/1";
    state.link.previewImage = "https://cdn.example.com/preview.png";
    state.link.siteName = "Dribbble";
    state.link.platform = "dribbble";

    const result = buildCreateItemInput(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toMatchObject({
        kind: "link",
        url: "https://dribbble.com/shots/1",
        data: {
          previewImage: "https://cdn.example.com/preview.png",
          siteName: "Dribbble",
          platform: "dribbble",
        },
      });
    }
  });

  it("rejects an image item until an upload has populated r2Key/width/height/mime", () => {
    const state = createEmptyFormState("image");
    expect(buildCreateItemInput(state).ok).toBe(false);
  });

  it("builds a valid image item input once the upload fields are populated", () => {
    const state = createEmptyFormState("image");
    state.image = { r2Key: "media/2026/09/a.png", width: 800, height: 600, mime: "image/png" };

    const result = buildCreateItemInput(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toMatchObject({
        kind: "image",
        data: { r2Key: "media/2026/09/a.png", width: 800, height: 600, mime: "image/png" },
      });
    }
  });

  it("keeps an image description, trimmed, and drops a blank one", () => {
    const state = createEmptyFormState("image");
    const upload = { r2Key: "media/2026/09/a.png", width: 800, height: 600, mime: "image/png" };

    state.image = { ...upload, description: "  A pier at dusk  " };
    const described = buildCreateItemInput(state);
    expect(described.ok && described.input.data).toMatchObject({ description: "A pier at dusk" });

    state.image = { ...upload, description: "   " };
    const blank = buildCreateItemInput(state);
    expect(blank.ok && blank.input.data).not.toHaveProperty("description", expect.anything());
  });

  it("rejects a video item with the youtube/vimeo provider and no embed url", () => {
    const state = createEmptyFormState("video");
    state.video.provider = "youtube";
    expect(buildCreateItemInput(state).ok).toBe(false);
  });

  it("rejects a video item with the file provider and no uploaded r2Key", () => {
    const state = createEmptyFormState("video");
    state.video.provider = "file";
    expect(buildCreateItemInput(state).ok).toBe(false);
  });

  it("builds a valid embed video item input", () => {
    const state = createEmptyFormState("video");
    state.video.provider = "youtube";
    state.video.embedUrl = "https://www.youtube.com/embed/abc123";

    const result = buildCreateItemInput(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toMatchObject({
        kind: "video",
        data: { provider: "youtube", embedUrl: "https://www.youtube.com/embed/abc123" },
      });
    }
  });

  it("rejects a palette item with zero colors", () => {
    const state = createEmptyFormState("palette");
    expect(buildCreateItemInput(state).ok).toBe(false);
  });

  it("builds a valid palette item input", () => {
    const state = createEmptyFormState("palette");
    state.palette.colors = [{ hex: "#F29A6B", name: "apricot" }, { hex: "#5E4C82" }];

    const result = buildCreateItemInput(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toMatchObject({
        kind: "palette",
        data: { colors: [{ hex: "#F29A6B", name: "apricot" }, { hex: "#5E4C82" }] },
      });
    }
  });

  it("builds a valid palette item input carrying per-color weight (T11b B5)", () => {
    const state = createEmptyFormState("palette");
    state.palette.colors = [
      { hex: "#F29A6B", weight: 60 },
      { hex: "#5E4C82", weight: 40 },
    ];

    const result = buildCreateItemInput(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toMatchObject({
        kind: "palette",
        data: {
          colors: [
            { hex: "#F29A6B", weight: 60 },
            { hex: "#5E4C82", weight: 40 },
          ],
        },
      });
    }
  });

  it("rejects a font item without a family name", () => {
    const state = createEmptyFormState("font");
    expect(buildCreateItemInput(state).ok).toBe(false);
  });

  it("builds a valid font item input", () => {
    const state = createEmptyFormState("font");
    state.font.family = "Geist Variable";
    state.font.sourceUrl = "https://vercel.com/font";
    state.font.provider = "other";
    state.font.license = "free";

    const result = buildCreateItemInput(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toMatchObject({
        kind: "font",
        data: {
          family: "Geist Variable",
          sourceUrl: "https://vercel.com/font",
          provider: "other",
          license: "free",
        },
      });
    }
  });
});

describe("formStateFromItem / buildUpdateItemInput (edit mode)", () => {
  const textItem: Item = {
    id: "01HZY3Q3G0K8R4S8T2V6W0X4Y6",
    kind: "text",
    title: "Existing note",
    notes: "some notes",
    source: "web",
    categoryIds: ["cat-1"],
    tags: ["ui", "nature"],
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
    data: { body: "existing body" },
  };

  it("prefills form state from an existing item", () => {
    const state = formStateFromItem(textItem);
    expect(state.kind).toBe("text");
    expect(state.title).toBe("Existing note");
    expect(state.tags).toEqual(["ui", "nature"]);
    expect(state.categoryIds).toEqual(["cat-1"]);
    expect(state.text.body).toBe("existing body");
  });

  it("builds an update input preserving kind and reflecting edited fields", () => {
    const state = formStateFromItem(textItem);
    state.title = "Renamed note";
    state.text.body = "updated body";

    const result = buildUpdateItemInput(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input).toMatchObject({
        kind: "text",
        title: "Renamed note",
        data: { body: "updated body" },
      });
    }
  });

  it("rejects an update that would leave a required field empty", () => {
    const state = formStateFromItem(textItem);
    state.text.body = "";
    expect(buildUpdateItemInput(state).ok).toBe(false);
  });

  it("prefills a palette item's per-color weight for editing (T11b B5)", () => {
    const paletteItem: Item = {
      ...textItem,
      kind: "palette",
      data: {
        colors: [
          { hex: "#F29A6B", weight: 60 },
          { hex: "#5E4C82", weight: 40 },
        ],
      },
    };
    const state = formStateFromItem(paletteItem);
    expect(state.palette.colors).toEqual([
      { hex: "#F29A6B", name: undefined, weight: 60 },
      { hex: "#5E4C82", name: undefined, weight: 40 },
    ]);
  });
});
