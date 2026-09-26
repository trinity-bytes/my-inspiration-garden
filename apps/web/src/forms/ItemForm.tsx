import type { Category, ItemKind } from "@garden/shared";
import { useId, useState } from "react";
import {
  type StoredMedia,
  type UnfurlMetadataResult,
  unfurlLink,
  uploadMedia,
} from "../api/endpoints";
import { CategoryTree } from "../filters/CategoryTree";
import { buildCategoryTree } from "../filters/filter-state";
import {
  buildCreateItemInput,
  buildUpdateItemInput,
  type CreateItemFormInput,
  type ItemFormState,
} from "./item-form-state";
import "./ItemForm.css";
import { type ImageUploadResult, uploadImageFile } from "./media-upload";
import { TagInput } from "./TagInput";

const KIND_OPTIONS: { value: ItemKind; label: string }[] = [
  { value: "image", label: "Image" },
  { value: "link", label: "Link" },
  { value: "text", label: "Text" },
  { value: "video", label: "Video" },
  { value: "palette", label: "Palette" },
  { value: "font", label: "Font" },
];

export interface ItemFormProps {
  mode: "create" | "edit";
  initialState: ItemFormState;
  categories: Category[];
  onSubmit: (input: CreateItemFormInput) => void | Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
  submitError?: string | null;
  unfurl?: (url: string) => Promise<UnfurlMetadataResult>;
  uploadImage?: (file: File) => Promise<ImageUploadResult>;
  uploadVideoFile?: (file: File) => Promise<StoredMedia>;
}

/**
 * Owner-only form for quick-add and edit (T11), shared by both modals. Field
 * validation is delegated to the pure `item-form-state` builders — this
 * component only renders inputs, wires per-kind async side effects (link
 * unfurl, image/video upload) and reports the validated payload to the
 * caller's `onSubmit`.
 */
export function ItemForm({
  mode,
  initialState,
  categories,
  onSubmit,
  onCancel,
  submitting = false,
  submitError = null,
  unfurl = unfurlLink,
  uploadImage = uploadImageFile,
  uploadVideoFile = uploadMedia,
}: ItemFormProps) {
  const [state, setState] = useState<ItemFormState>(initialState);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [unfurlStatus, setUnfurlStatus] = useState<"idle" | "loading" | "error">("idle");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "loading" | "error">("idle");
  const formId = useId();
  const categoryTree = buildCategoryTree(categories);

  function update(patch: Partial<ItemFormState>): void {
    setState((current) => ({ ...current, ...patch }));
  }

  function updateKindData<K extends "text" | "link" | "image" | "video" | "palette" | "font">(
    key: K,
    patch: Partial<ItemFormState[K]>,
  ): void {
    setState((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  async function handleFetchPreview(): Promise<void> {
    const url = state.url.trim();
    if (!url) return;
    setUnfurlStatus("loading");
    try {
      const metadata = await unfurl(url);
      setState((current) => ({
        ...current,
        title: current.title.trim().length > 0 ? current.title : (metadata.title ?? current.title),
        link: {
          ...current.link,
          siteName: metadata.siteName ?? current.link.siteName,
          previewImage: metadata.previewImage ?? current.link.previewImage,
          description: metadata.description ?? current.link.description,
        },
      }));
      setUnfurlStatus("idle");
    } catch {
      setUnfurlStatus("error");
    }
  }

  async function handleImageFileChange(file: File | undefined): Promise<void> {
    if (!file) return;
    setUploadStatus("loading");
    try {
      const result = await uploadImage(file);
      updateKindData("image", result);
      setUploadStatus("idle");
    } catch {
      setUploadStatus("error");
    }
  }

  async function handleVideoFileChange(file: File | undefined): Promise<void> {
    if (!file) return;
    setUploadStatus("loading");
    try {
      const stored = await uploadVideoFile(file);
      updateKindData("video", { r2Key: stored.r2Key });
      setUploadStatus("idle");
    } catch {
      setUploadStatus("error");
    }
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    const result = mode === "create" ? buildCreateItemInput(state) : buildUpdateItemInput(state);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }
    setValidationError(null);
    void onSubmit(result.input as CreateItemFormInput);
  }

  function addPaletteColor(): void {
    updateKindData("palette", { colors: [...state.palette.colors, { hex: "#000000" }] });
  }

  function removePaletteColor(index: number): void {
    updateKindData("palette", { colors: state.palette.colors.filter((_, i) => i !== index) });
  }

  function updatePaletteColor(index: number, patch: { hex?: string; name?: string }): void {
    updateKindData("palette", {
      colors: state.palette.colors.map((color, i) =>
        i === index ? { ...color, ...patch } : color,
      ),
    });
  }

  const error = validationError ?? submitError;

  return (
    <form className="item-form" onSubmit={handleSubmit}>
      {error && (
        <p className="item-form__error" role="alert">
          {error}
        </p>
      )}

      {mode === "create" && (
        <label className="item-form__field" htmlFor={`${formId}-kind`}>
          Kind
          <select
            id={`${formId}-kind`}
            value={state.kind}
            onChange={(event) => update({ kind: event.target.value as ItemKind })}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="item-form__field" htmlFor={`${formId}-title`}>
        Title
        <input
          id={`${formId}-title`}
          type="text"
          value={state.title}
          onChange={(event) => update({ title: event.target.value })}
        />
      </label>

      {state.kind === "link" && (
        <label className="item-form__field" htmlFor={`${formId}-url`}>
          URL
          <div className="item-form__url-row">
            <input
              id={`${formId}-url`}
              type="url"
              value={state.url}
              onChange={(event) => update({ url: event.target.value })}
            />
            <button
              type="button"
              onClick={handleFetchPreview}
              disabled={unfurlStatus === "loading" || state.url.trim().length === 0}
            >
              Fetch preview
            </button>
          </div>
          {unfurlStatus === "error" && (
            <span className="item-form__hint">Could not fetch a preview.</span>
          )}
        </label>
      )}

      {state.kind === "text" && (
        <label className="item-form__field" htmlFor={`${formId}-text-body`}>
          Body
          <textarea
            id={`${formId}-text-body`}
            value={state.text.body}
            onChange={(event) => updateKindData("text", { body: event.target.value })}
          />
        </label>
      )}

      {state.kind === "link" && (
        <>
          <label className="item-form__field" htmlFor={`${formId}-link-site`}>
            Site name
            <input
              id={`${formId}-link-site`}
              type="text"
              value={state.link.siteName ?? ""}
              onChange={(event) => updateKindData("link", { siteName: event.target.value })}
            />
          </label>
          <label className="item-form__field" htmlFor={`${formId}-link-description`}>
            Description
            <textarea
              id={`${formId}-link-description`}
              value={state.link.description ?? ""}
              onChange={(event) => updateKindData("link", { description: event.target.value })}
            />
          </label>
          {state.link.previewImage && (
            <img className="item-form__preview" src={state.link.previewImage} alt="Link preview" />
          )}
        </>
      )}

      {state.kind === "image" && (
        <label className="item-form__field" htmlFor={`${formId}-image-file`}>
          Image file
          <input
            id={`${formId}-image-file`}
            type="file"
            accept="image/*"
            onChange={(event) => void handleImageFileChange(event.target.files?.[0])}
          />
          {uploadStatus === "loading" && <span className="item-form__hint">Uploading…</span>}
          {uploadStatus === "error" && <span className="item-form__hint">Upload failed.</span>}
          {state.image.r2Key && (
            <img
              className="item-form__preview"
              src={`/api/media/${state.image.r2Key}`}
              alt="Uploaded"
            />
          )}
        </label>
      )}

      {state.kind === "video" && (
        <>
          <label className="item-form__field" htmlFor={`${formId}-video-provider`}>
            Provider
            <select
              id={`${formId}-video-provider`}
              value={state.video.provider}
              onChange={(event) =>
                updateKindData("video", {
                  provider: event.target.value as ItemFormState["video"]["provider"],
                })
              }
            >
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="file">Uploaded file</option>
            </select>
          </label>
          {(state.video.provider === "youtube" || state.video.provider === "vimeo") && (
            <label className="item-form__field" htmlFor={`${formId}-video-embed`}>
              Embed URL
              <input
                id={`${formId}-video-embed`}
                type="url"
                value={state.video.embedUrl ?? ""}
                onChange={(event) => updateKindData("video", { embedUrl: event.target.value })}
              />
            </label>
          )}
          {state.video.provider === "file" && (
            <label className="item-form__field" htmlFor={`${formId}-video-file`}>
              Video file
              <input
                id={`${formId}-video-file`}
                type="file"
                accept="video/*"
                onChange={(event) => void handleVideoFileChange(event.target.files?.[0])}
              />
              {uploadStatus === "loading" && <span className="item-form__hint">Uploading…</span>}
              {uploadStatus === "error" && <span className="item-form__hint">Upload failed.</span>}
            </label>
          )}
          <label className="item-form__field" htmlFor={`${formId}-video-thumbnail`}>
            Thumbnail URL
            <input
              id={`${formId}-video-thumbnail`}
              type="url"
              value={state.video.thumbnail ?? ""}
              onChange={(event) => updateKindData("video", { thumbnail: event.target.value })}
            />
          </label>
        </>
      )}

      {state.kind === "palette" && (
        <fieldset className="item-form__field item-form__palette">
          <legend>Colors</legend>
          {state.palette.colors.map((color, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: palette colors have no stable id; this row's own fields are already keyed by the same position.
            <div className="item-form__palette-row" key={index}>
              <label htmlFor={`${formId}-palette-hex-${index}`}>
                {`Color ${index + 1} hex`}
                <input
                  id={`${formId}-palette-hex-${index}`}
                  type="text"
                  value={color.hex}
                  onChange={(event) => updatePaletteColor(index, { hex: event.target.value })}
                />
              </label>
              <label htmlFor={`${formId}-palette-name-${index}`}>
                {`Color ${index + 1} name`}
                <input
                  id={`${formId}-palette-name-${index}`}
                  type="text"
                  value={color.name ?? ""}
                  onChange={(event) => updatePaletteColor(index, { name: event.target.value })}
                />
              </label>
              <button type="button" onClick={() => removePaletteColor(index)}>
                Remove color
              </button>
            </div>
          ))}
          <button type="button" onClick={addPaletteColor}>
            Add color
          </button>
        </fieldset>
      )}

      {state.kind === "font" && (
        <>
          <label className="item-form__field" htmlFor={`${formId}-font-family`}>
            Font family
            <input
              id={`${formId}-font-family`}
              type="text"
              value={state.font.family}
              onChange={(event) => updateKindData("font", { family: event.target.value })}
            />
          </label>
          <label className="item-form__field" htmlFor={`${formId}-font-source`}>
            Source URL
            <input
              id={`${formId}-font-source`}
              type="url"
              value={state.font.sourceUrl ?? ""}
              onChange={(event) => updateKindData("font", { sourceUrl: event.target.value })}
            />
          </label>
          <label className="item-form__field" htmlFor={`${formId}-font-provider`}>
            Provider
            <select
              id={`${formId}-font-provider`}
              value={state.font.provider ?? ""}
              onChange={(event) =>
                updateKindData("font", {
                  provider: (event.target.value || undefined) as ItemFormState["font"]["provider"],
                })
              }
            >
              <option value="">—</option>
              <option value="google">Google Fonts</option>
              <option value="fontshare">Fontshare</option>
              <option value="foundry">Foundry</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="item-form__field" htmlFor={`${formId}-font-license`}>
            License
            <select
              id={`${formId}-font-license`}
              value={state.font.license ?? ""}
              onChange={(event) =>
                updateKindData("font", {
                  license: (event.target.value || undefined) as ItemFormState["font"]["license"],
                })
              }
            >
              <option value="">—</option>
              <option value="free">Free</option>
              <option value="commercial">Commercial</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label className="item-form__field" htmlFor={`${formId}-font-preview-text`}>
            Preview text
            <input
              id={`${formId}-font-preview-text`}
              type="text"
              value={state.font.previewText ?? ""}
              onChange={(event) => updateKindData("font", { previewText: event.target.value })}
            />
          </label>
        </>
      )}

      <label className="item-form__field" htmlFor={`${formId}-notes`}>
        Notes
        <textarea
          id={`${formId}-notes`}
          value={state.notes}
          onChange={(event) => update({ notes: event.target.value })}
        />
      </label>

      <label className="item-form__field" htmlFor={`${formId}-tags`}>
        Tags
        <TagInput id={`${formId}-tags`} tags={state.tags} onChange={(tags) => update({ tags })} />
      </label>

      {categoryTree.length > 0 && (
        <fieldset className="item-form__field">
          <legend>Categories</legend>
          <CategoryTree
            nodes={categoryTree}
            selectedIds={state.categoryIds}
            onToggle={(categoryId) =>
              update({
                categoryIds: state.categoryIds.includes(categoryId)
                  ? state.categoryIds.filter((id) => id !== categoryId)
                  : [...state.categoryIds, categoryId],
              })
            }
          />
        </fieldset>
      )}

      <div className="item-form__actions">
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" disabled={submitting}>
          {mode === "create" ? "Add item" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
