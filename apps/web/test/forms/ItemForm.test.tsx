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
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "ui, nature" } });
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
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "font" } });
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
    expect(screen.getByLabelText("Tags")).toHaveValue("ui");
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

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "file" } });
    expect(screen.queryByLabelText("Embed URL")).not.toBeInTheDocument();

    const file = new File(["abc"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Video file"), { target: { files: [file] } });

    await waitFor(() => expect(uploadVideoFile).toHaveBeenCalledWith(file));
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

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "font" } });
    fireEvent.change(screen.getByLabelText("Font family"), { target: { value: "Geist Variable" } });

    fireEvent.click(screen.getByRole("button", { name: /add item|save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      kind: "font",
      data: { family: "Geist Variable" },
    });
  });
});
