import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemForm } from "../../src/forms/ItemForm";
import { createEmptyFormState, formStateFromItem } from "../../src/forms/item-form-state";

const categories = [
  { id: "c1", name: "Illustration", slug: "illustration", parentId: null, position: 0 },
];

describe("ItemForm — common fields and kind switching", () => {
  it("defaults to the text kind and submits a valid text item", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("text")}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Body"), { target: { value: "hello garden" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My note" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Illustration" }));
    const tagsInput = screen.getByLabelText("Tags");
    fireEvent.change(tagsInput, { target: { value: "ui" } });
    fireEvent.keyDown(tagsInput, { key: "Enter" });
    fireEvent.change(tagsInput, { target: { value: "nature" } });
    fireEvent.keyDown(tagsInput, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /add item|save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submitted = onSubmit.mock.calls[0]?.[0];
    expect(submitted).toMatchObject({
      kind: "text",
      title: "My note",
      categoryIds: ["c1"],
      tags: ["ui", "nature"],
      data: { body: "hello garden" },
    });
  });

  it("switches visible fields when the kind selector changes", () => {
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("text")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Body")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Kind"));
    fireEvent.click(screen.getByRole("option", { name: "Font" }));
    expect(screen.queryByLabelText("Body")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Font family")).toBeInTheDocument();
  });

  it("shows a validation error and does not submit when a required field is missing", async () => {
    const onSubmit = vi.fn();
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("text")}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add item|save/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/body is required/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onCancel from the cancel button", () => {
    const onCancel = vi.fn();
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("text")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows a submitError passed by the parent", () => {
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("text")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        submitError="the garden api rejected this item"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("the garden api rejected this item");
  });
});

describe("ItemForm — edit mode", () => {
  it("hides the kind selector and prefills fields from the initial state", () => {
    const item = {
      id: "01HZY3Q3G0K8R4S8T2V6W0X4Y6",
      kind: "text" as const,
      title: "Existing",
      source: "web",
      categoryIds: [],
      tags: ["ui"],
      createdAt: "2026-09-23T00:00:00.000Z",
      updatedAt: "2026-09-23T00:00:00.000Z",
      data: { body: "existing body" },
    };
    render(
      <ItemForm
        mode="edit"
        initialState={formStateFromItem(item)}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Kind")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Existing");
    expect(screen.getByLabelText("Body")).toHaveValue("existing body");
    expect(screen.getByRole("button", { name: "Remove tag ui" })).toBeInTheDocument();
  });
});

describe("ItemForm — link kind", () => {
  it("requires a url and fetches an unfurl preview into siteName/previewImage", async () => {
    const unfurl = vi.fn().mockResolvedValue({
      url: "https://dribbble.com/shots/1",
      platform: "dribbble",
      title: "A shot",
      siteName: "Dribbble",
      previewImage: "https://cdn.example.com/preview.png",
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("link")}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        unfurl={unfurl}
      />,
    );

    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://dribbble.com/shots/1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch preview" }));

    await waitFor(() => expect(unfurl).toHaveBeenCalledWith("https://dribbble.com/shots/1"));
    expect(await screen.findByLabelText("Title")).toHaveValue("A shot");

    fireEvent.click(screen.getByRole("button", { name: /add item|save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: "link",
      url: "https://dribbble.com/shots/1",
      data: { siteName: "Dribbble", previewImage: "https://cdn.example.com/preview.png" },
    });
  });
});

describe("ItemForm — image kind", () => {
  it("flags the image field itself when saving without an upload, and shows the picked file name", async () => {
    const onSubmit = vi.fn();
    const uploadImage = vi.fn(() => new Promise<never>(() => {}));
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("image")}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        uploadImage={uploadImage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Upload an image before saving.");
    expect(screen.getByText("Required for image items.")).toBeInTheDocument();
    expect(screen.getByLabelText("Image file")).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();

    const file = new File(["abc"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), { target: { files: [file] } });
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("uploads a selected file via the injected uploadImage and enables submit once it resolves", async () => {
    const uploadImage = vi.fn().mockResolvedValue({
      r2Key: "media/2026/09/a.png",
      mime: "image/png",
      width: 800,
      height: 600,
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("image")}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        uploadImage={uploadImage}
      />,
    );

    const file = new File(["abc"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Image file"), { target: { files: [file] } });

    await waitFor(() => expect(uploadImage).toHaveBeenCalledWith(file));
    await screen.findByAltText(/uploaded/i);

    fireEvent.click(screen.getByRole("button", { name: /add item|save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: "image",
      data: { r2Key: "media/2026/09/a.png", width: 800, height: 600, mime: "image/png" },
    });
  });
});

describe("ItemForm — video kind", () => {
  it("shows embedUrl for the youtube provider and uploads a file for the file provider", async () => {
    const uploadVideoFile = vi
      .fn()
      .mockResolvedValue({ r2Key: "media/2026/09/v.mp4", mime: "video/mp4", size: 1 });
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("video")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        uploadVideoFile={uploadVideoFile}
      />,
    );

    expect(screen.getByLabelText("Embed URL")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Provider"));
    fireEvent.click(screen.getByRole("option", { name: "Uploaded file" }));
    expect(screen.queryByLabelText("Embed URL")).not.toBeInTheDocument();

    const file = new File(["abc"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Video file"), { target: { files: [file] } });

    await waitFor(() => expect(uploadVideoFile).toHaveBeenCalledWith(file));
  });

  it("detects provider/embed URL from a pasted YouTube URL and fills empty title + thumbnail via unfurl", async () => {
    const unfurl = vi.fn().mockResolvedValue({
      url: "https://www.youtube.com/watch?v=abc123",
      platform: "youtube",
      title: "A great video",
      previewImage: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    });
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("video")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        unfurl={unfurl}
      />,
    );

    fireEvent.change(screen.getByLabelText("Video URL"), {
      target: { value: "https://www.youtube.com/watch?v=abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Detect video" }));

    await waitFor(() =>
      expect(unfurl).toHaveBeenCalledWith("https://www.youtube.com/watch?v=abc123"),
    );
    expect(await screen.findByLabelText("Title")).toHaveValue("A great video");
    expect(screen.getByLabelText("Embed URL")).toHaveValue("https://www.youtube.com/embed/abc123");
    expect(screen.getByLabelText("Thumbnail URL")).toHaveValue(
      "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    );
  });

  it("does not overwrite an already-filled title when detecting a video", async () => {
    const unfurl = vi.fn().mockResolvedValue({
      url: "https://vimeo.com/76979871",
      platform: "vimeo",
      title: "Vimeo title",
    });
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("video")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        unfurl={unfurl}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My own title" } });
    fireEvent.change(screen.getByLabelText("Video URL"), {
      target: { value: "https://vimeo.com/76979871" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Detect video" }));

    await waitFor(() => expect(unfurl).toHaveBeenCalled());
    expect(screen.getByLabelText("Title")).toHaveValue("My own title");
    expect(screen.getByLabelText("Embed URL")).toHaveValue(
      "https://player.vimeo.com/video/76979871",
    );
  });

  it("shows an error and does not call unfurl for a url that isn't a recognized video url", async () => {
    const unfurl = vi.fn();
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("video")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        unfurl={unfurl}
      />,
    );

    fireEvent.change(screen.getByLabelText("Video URL"), {
      target: { value: "https://example.com/not-a-video" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Detect video" }));

    expect(unfurl).not.toHaveBeenCalled();
    expect(await screen.findByText(/doesn.t look like a youtube or vimeo/i)).toBeInTheDocument();
  });

  it("keeps the derived embed URL even when the unfurl fetch fails (non-fatal)", async () => {
    const unfurl = vi.fn().mockRejectedValue(new Error("network error"));
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("video")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        unfurl={unfurl}
      />,
    );

    fireEvent.change(screen.getByLabelText("Video URL"), {
      target: { value: "https://youtu.be/abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Detect video" }));

    await waitFor(() => expect(unfurl).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByLabelText("Embed URL")).toHaveValue(
        "https://www.youtube.com/embed/abc123",
      ),
    );
    expect(screen.queryByText(/doesn.t look like/i)).not.toBeInTheDocument();
  });

  it("shows a loading state while detecting", async () => {
    let resolveUnfurl: (value: unknown) => void = () => {};
    const unfurl = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveUnfurl = resolve;
      }),
    );
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("video")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        unfurl={unfurl}
      />,
    );

    fireEvent.change(screen.getByLabelText("Video URL"), {
      target: { value: "https://youtu.be/abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Detect video" }));

    expect(await screen.findByText(/detecting/i)).toBeInTheDocument();
    resolveUnfurl({ url: "https://youtu.be/abc123", platform: "youtube" });
    await waitFor(() => expect(screen.queryByText(/detecting/i)).not.toBeInTheDocument());
  });

  it("keeps the video URL and embed fields editable after detection", async () => {
    const unfurl = vi
      .fn()
      .mockResolvedValue({ url: "https://youtu.be/abc123", platform: "youtube" });
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("video")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        unfurl={unfurl}
      />,
    );

    fireEvent.change(screen.getByLabelText("Video URL"), {
      target: { value: "https://youtu.be/abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Detect video" }));
    await waitFor(() => expect(unfurl).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Embed URL"), {
      target: { value: "https://www.youtube.com/embed/other" },
    });
    expect(screen.getByLabelText("Embed URL")).toHaveValue("https://www.youtube.com/embed/other");
  });
});

describe("ItemForm — palette kind", () => {
  it("adds and removes color rows and submits the built palette", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("palette")}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add color" }));
    fireEvent.change(screen.getByLabelText("Color 1 hex"), { target: { value: "#F29A6B" } });
    fireEvent.click(screen.getByRole("button", { name: "Add color" }));
    fireEvent.change(screen.getByLabelText("Color 2 hex"), { target: { value: "#5E4C82" } });

    fireEvent.click(screen.getByRole("button", { name: /add item|save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: "palette",
      data: { colors: [{ hex: "#F29A6B" }, { hex: "#5E4C82" }] },
    });

    const [firstRemoveButton] = screen.getAllByRole("button", { name: "Remove color" });
    fireEvent.click(firstRemoveButton as HTMLElement);
    expect(screen.queryByLabelText("Color 1 hex")).toHaveValue("#5E4C82");
  });

  it("shows a % weight input per color, submits it, and shows a running total (T11b B5)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("palette")}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add color" }));
    fireEvent.change(screen.getByLabelText("Color 1 hex"), { target: { value: "#F29A6B" } });
    fireEvent.change(screen.getByLabelText("Color 1 weight (%)"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Add color" }));
    fireEvent.change(screen.getByLabelText("Color 2 hex"), { target: { value: "#5E4C82" } });
    fireEvent.change(screen.getByLabelText("Color 2 weight (%)"), { target: { value: "40" } });

    expect(screen.getByText(/total.*100%/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add item|save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: "palette",
      data: {
        colors: [
          { hex: "#F29A6B", weight: 60 },
          { hex: "#5E4C82", weight: 40 },
        ],
      },
    });
  });

  it("shows a running total that reflects weights not summing to 100", () => {
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("palette")}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add color" }));
    fireEvent.change(screen.getByLabelText("Color 1 weight (%)"), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: "Add color" }));
    fireEvent.change(screen.getByLabelText("Color 2 weight (%)"), { target: { value: "70" } });

    expect(screen.getByText(/total.*140%/i)).toBeInTheDocument();
  });
});

describe("ItemForm — font kind", () => {
  it("submits a valid font item", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("font")}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Kind"));
    fireEvent.click(screen.getByRole("option", { name: "Font" }));
    fireEvent.change(screen.getByLabelText("Font family"), { target: { value: "Geist Variable" } });

    fireEvent.click(screen.getByRole("button", { name: /add item|save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: "font",
      data: { family: "Geist Variable" },
    });
  });
});

describe("ItemForm — category picker hierarchy (T11b B6 item 5)", () => {
  it("nests a child category's checkbox under its parent (already indented via the shared CategoryTree/FilterPanel.css, not flat)", () => {
    const nested = [
      { id: "c1", name: "Illustration", slug: "illustration", parentId: null, position: 0 },
      { id: "c2", name: "Pixel art", slug: "pixel-art", parentId: "c1", position: 0 },
    ];
    render(
      <ItemForm
        mode="create"
        initialState={createEmptyFormState("text")}
        categories={nested}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const parentItem = screen.getByRole("checkbox", { name: "Illustration" }).closest("li");
    const childItem = screen.getByRole("checkbox", { name: "Pixel art" }).closest("li");
    expect(parentItem).not.toBeNull();
    expect(childItem?.closest("ul")?.parentElement).toBe(parentItem);
  });
});

describe("ItemForm — link preview image", () => {
  function linkItem(previewImage?: string) {
    return {
      id: "01HZY3Q3G0K8R4S8T2V6W0X4Y6",
      kind: "link" as const,
      title: "A site",
      url: "https://example.com",
      source: "web",
      categoryIds: [] as string[],
      tags: [] as string[],
      createdAt: "2026-09-23T00:00:00.000Z",
      updatedAt: "2026-09-23T00:00:00.000Z",
      data: previewImage ? { previewImage } : {},
    };
  }

  it("uploads a picked preview image and submits its r2Key", async () => {
    const uploadPreviewImage = vi.fn().mockResolvedValue({
      r2Key: "media/2026/11/shot.png",
      mime: "image/png",
      size: 3,
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        mode="edit"
        initialState={formStateFromItem(linkItem())}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        uploadPreviewImage={uploadPreviewImage}
      />,
    );

    const file = new File(["abc"], "shot.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Preview image"), { target: { files: [file] } });

    await waitFor(() => expect(uploadPreviewImage).toHaveBeenCalledWith(file));
    expect(await screen.findByAltText("Link preview")).toHaveAttribute(
      "src",
      "/api/media/media/2026/11/shot.png",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: "link",
      data: { previewImage: "media/2026/11/shot.png" },
    });
  });

  it("uploads a screenshot pasted anywhere in the link form", async () => {
    const uploadPreviewImage = vi.fn().mockResolvedValue({
      r2Key: "media/2026/11/pasted.png",
      mime: "image/png",
      size: 3,
    });
    render(
      <ItemForm
        mode="edit"
        initialState={formStateFromItem(linkItem())}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        uploadPreviewImage={uploadPreviewImage}
      />,
    );

    const file = new File(["abc"], "pasted.png", { type: "image/png" });
    fireEvent.paste(screen.getByLabelText("Description"), {
      clipboardData: { files: [file], items: [] },
    });

    await waitFor(() => expect(uploadPreviewImage).toHaveBeenCalledWith(file));
    expect(await screen.findByAltText("Link preview")).toHaveAttribute(
      "src",
      "/api/media/media/2026/11/pasted.png",
    );
  });

  it("ignores a paste that carries no image", () => {
    const uploadPreviewImage = vi.fn();
    render(
      <ItemForm
        mode="edit"
        initialState={formStateFromItem(linkItem())}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        uploadPreviewImage={uploadPreviewImage}
      />,
    );

    fireEvent.paste(screen.getByLabelText("Description"), {
      clipboardData: {
        files: [],
        items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
      },
    });

    expect(uploadPreviewImage).not.toHaveBeenCalled();
  });

  it("removes an existing preview image from the submitted payload", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        mode="edit"
        initialState={formStateFromItem(linkItem("media/2026/11/old.png"))}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByAltText("Link preview")).toHaveAttribute(
      "src",
      "/api/media/media/2026/11/old.png",
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove preview image" }));
    expect(screen.queryByAltText("Link preview")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submitted = onSubmit.mock.calls[0]?.[0] as { data?: Record<string, unknown> } | undefined;
    expect(submitted?.data).not.toHaveProperty("previewImage");
  });

  it("keeps a chosen preview image when Fetch preview returns another one", async () => {
    const uploadPreviewImage = vi.fn().mockResolvedValue({
      r2Key: "media/2026/11/shot.png",
      mime: "image/png",
      size: 3,
    });
    const unfurl = vi.fn().mockResolvedValue({
      previewImage: "https://example.com/og.png",
      description: "From the site",
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        mode="edit"
        initialState={formStateFromItem(linkItem())}
        categories={categories}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        unfurl={unfurl}
        uploadPreviewImage={uploadPreviewImage}
      />,
    );

    const file = new File(["abc"], "shot.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Preview image"), { target: { files: [file] } });
    await screen.findByAltText("Link preview");

    fireEvent.click(screen.getByRole("button", { name: "Fetch preview" }));
    await waitFor(() => expect(screen.getByLabelText("Description")).toHaveValue("From the site"));

    expect(screen.getByAltText("Link preview")).toHaveAttribute(
      "src",
      "/api/media/media/2026/11/shot.png",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      data: { previewImage: "media/2026/11/shot.png", description: "From the site" },
    });
  });

  it("lets Fetch preview fill the image again after the chosen one is removed", async () => {
    const uploadPreviewImage = vi.fn().mockResolvedValue({
      r2Key: "media/2026/11/shot.png",
      mime: "image/png",
      size: 3,
    });
    const unfurl = vi.fn().mockResolvedValue({ previewImage: "https://example.com/og.png" });
    render(
      <ItemForm
        mode="edit"
        initialState={formStateFromItem(linkItem())}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        unfurl={unfurl}
        uploadPreviewImage={uploadPreviewImage}
      />,
    );

    const file = new File(["abc"], "shot.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Preview image"), { target: { files: [file] } });
    await screen.findByAltText("Link preview");
    fireEvent.click(screen.getByRole("button", { name: "Remove preview image" }));

    fireEvent.click(screen.getByRole("button", { name: "Fetch preview" }));
    expect(await screen.findByAltText("Link preview")).toHaveAttribute(
      "src",
      "https://example.com/og.png",
    );
  });

  it("blocks saving while a preview image is still uploading", async () => {
    let finishUpload: (stored: { r2Key: string; mime: string; size: number }) => void = () => {};
    const uploadPreviewImage = vi.fn(
      () =>
        new Promise<{ r2Key: string; mime: string; size: number }>((resolve) => {
          finishUpload = resolve;
        }),
    );
    render(
      <ItemForm
        mode="edit"
        initialState={formStateFromItem(linkItem())}
        categories={categories}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        uploadPreviewImage={uploadPreviewImage}
      />,
    );

    const file = new File(["abc"], "shot.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Preview image"), { target: { files: [file] } });

    await waitFor(() => expect(uploadPreviewImage).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    finishUpload({ r2Key: "media/2026/11/shot.png", mime: "image/png", size: 3 });
    await screen.findByAltText("Link preview");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
});
