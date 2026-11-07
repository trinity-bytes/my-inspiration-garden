import type { Category, ItemKind } from "@garden/shared";
import { Check, CircleAlert, Plus } from "lucide-react";
import { useId, useRef, useState } from "react";
import {
  type StoredMedia,
  type UnfurlMetadataResult,
  unfurlLink,
  uploadMedia,
} from "../api/endpoints";
import { Button } from "../components/Button/Button";
import { Select, type SelectOption } from "../components/Select/Select";
import { CategoryTree } from "../filters/CategoryTree";
import { buildCategoryTree } from "../filters/filter-state";
import { KIND_ICONS, KIND_LABELS } from "../items/kind-icons";
import { firstClipboardImage } from "./clipboard-image";
import {
  buildCreateItemInput,
  buildUpdateItemInput,
  type CreateItemFormInput,
  type ItemFormState,
} from "./item-form-state";
import "./ItemForm.css";
import { FontFields } from "./fields/FontFields";
import { ImageFields } from "./fields/ImageFields";
import { LinkFields } from "./fields/LinkFields";
import { PaletteFields } from "./fields/PaletteFields";
import { TextFields } from "./fields/TextFields";
import type { UpdateKindData } from "./fields/types";
import { VideoFields } from "./fields/VideoFields";
import { type ImageUploadResult, uploadImageFile } from "./media-upload";
import { TagInput } from "./TagInput";
import { deriveVideoEmbed } from "./video-url";

const KIND_OPTIONS: SelectOption<ItemKind>[] = (
  ["image", "link", "text", "video", "palette", "font"] as const
).map((kind) => ({ value: kind, label: KIND_LABELS[kind], icon: KIND_ICONS[kind] }));

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
  /** Link preview image upload; defaults to the plain media upload (no palette extraction). */
  uploadPreviewImage?: (file: File) => Promise<StoredMedia>;
}

/**
 * Owner-only form for quick-add and edit, shared by both modals. Field
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
  uploadPreviewImage = uploadMedia,
}: ItemFormProps) {
  const [state, setState] = useState<ItemFormState>(initialState);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [unfurlStatus, setUnfurlStatus] = useState<"idle" | "loading" | "error">("idle");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "loading" | "error">("idle");
  // An image the owner picked or pasted outranks whatever Fetch preview finds.
  const previewImageChosen = useRef(false);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const formId = useId();
  const categoryTree = buildCategoryTree(categories);

  function update(patch: Partial<ItemFormState>): void {
    setState((current) => ({ ...current, ...patch }));
  }

  const updateKindData: UpdateKindData = (key, patch) => {
    setState((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

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
          previewImage: previewImageChosen.current
            ? current.link.previewImage
            : (metadata.previewImage ?? current.link.previewImage),
          description: metadata.description ?? current.link.description,
        },
      }));
      // Sites that block server fetches still answer 200 here, with no metadata.
      const foundPreview = metadata.title || metadata.description || metadata.previewImage;
      setUnfurlStatus(foundPreview ? "idle" : "error");
    } catch {
      setUnfurlStatus("error");
    }
  }

  async function handleFetchVideoPreview(): Promise<void> {
    const url = state.url.trim();
    if (!url) return;
    const derived = deriveVideoEmbed(url);
    if (!derived) {
      setUnfurlStatus("error");
      return;
    }
    updateKindData("video", { provider: derived.provider, embedUrl: derived.embedUrl });
    setUnfurlStatus("loading");
    try {
      const metadata = await unfurl(url);
      setState((current) => ({
        ...current,
        title: current.title.trim().length > 0 ? current.title : (metadata.title ?? current.title),
        video: { ...current.video, thumbnail: metadata.previewImage ?? current.video.thumbnail },
      }));
      setUnfurlStatus("idle");
    } catch {
      // Non-fatal: the embed URL/provider are already derived and saved;
      // only the title/thumbnail enrichment from unfurl failed.
      setUnfurlStatus("idle");
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

  async function handlePreviewImageFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setUploadStatus("loading");
    try {
      const stored = await uploadPreviewImage(file);
      previewImageChosen.current = true;
      updateKindData("link", { previewImage: stored.r2Key });
      setUploadStatus("idle");
    } catch {
      setUploadStatus("error");
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLFormElement>): void {
    // Only link and image items take an image; a text paste keeps its native
    // behavior because `firstClipboardImage` ignores non-image payloads.
    if (state.kind !== "link" && state.kind !== "image") return;
    const file = firstClipboardImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    setPickedFileName(file.name || "Pasted image");
    void (state.kind === "link" ? handlePreviewImageFile(file) : handleImageFileChange(file));
  }

  function removePreviewImage(): void {
    previewImageChosen.current = false;
    setState((current) => {
      const { previewImage: _removed, ...link } = current.link;
      return { ...current, link };
    });
    setPickedFileName(null);
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

  const error = validationError ?? submitError;
  // The banner says what's wrong; the image field itself also carries it.
  const imageMissing = state.kind === "image" && validationError !== null && !state.image.r2Key;
  // Saving now would drop the image: the link payload has no key for it yet.
  const previewImageUploading = state.kind === "link" && uploadStatus === "loading";

  return (
    <form className="item-form" onSubmit={handleSubmit} onPaste={handlePaste}>
      {error && (
        <p className="dialog-error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}

      {mode === "create" && (
        <label className="item-form__field" htmlFor={`${formId}-kind`}>
          Kind
          <Select
            id={`${formId}-kind`}
            value={state.kind}
            options={KIND_OPTIONS}
            onChange={(kind) => update({ kind })}
            data-autofocus
          />
        </label>
      )}

      <label className="item-form__field" htmlFor={`${formId}-title`}>
        Title
        <input
          id={`${formId}-title`}
          type="text"
          value={state.title}
          onChange={(event) => update({ title: event.target.value })}
          data-autofocus={mode === "edit" || undefined}
        />
      </label>

      {state.kind === "link" && (
        <LinkFields
          formId={formId}
          url={state.url}
          link={state.link}
          unfurlStatus={unfurlStatus}
          uploadStatus={uploadStatus}
          pickedFileName={pickedFileName}
          onUrlChange={(url) => update({ url })}
          onFetchPreview={handleFetchPreview}
          onPreviewFileChosen={(file) => {
            setPickedFileName(file?.name ?? null);
            void handlePreviewImageFile(file);
          }}
          onRemovePreviewImage={removePreviewImage}
          updateKindData={updateKindData}
        />
      )}

      {state.kind === "text" && (
        <TextFields formId={formId} text={state.text} updateKindData={updateKindData} />
      )}

      {state.kind === "image" && (
        <ImageFields
          formId={formId}
          image={state.image}
          imageMissing={imageMissing}
          uploadStatus={uploadStatus}
          pickedFileName={pickedFileName}
          onFileChosen={(file) => {
            setPickedFileName(file?.name ?? null);
            void handleImageFileChange(file);
          }}
          updateKindData={updateKindData}
        />
      )}

      {state.kind === "video" && (
        <VideoFields
          formId={formId}
          url={state.url}
          video={state.video}
          unfurlStatus={unfurlStatus}
          uploadStatus={uploadStatus}
          pickedFileName={pickedFileName}
          onUrlChange={(url) => update({ url })}
          onDetectVideo={handleFetchVideoPreview}
          onFileChosen={(file) => {
            setPickedFileName(file?.name ?? null);
            void handleVideoFileChange(file);
          }}
          updateKindData={updateKindData}
        />
      )}

      {state.kind === "palette" && (
        <PaletteFields
          formId={formId}
          colors={state.palette.colors}
          updateKindData={updateKindData}
        />
      )}

      {state.kind === "font" && (
        <FontFields formId={formId} font={state.font} updateKindData={updateKindData} />
      )}

      <div className="item-form__field">
        <label htmlFor={`${formId}-notes`}>Notes</label>
        <textarea
          id={`${formId}-notes`}
          aria-describedby={`${formId}-notes-hint`}
          value={state.notes}
          onChange={(event) => update({ notes: event.target.value })}
        />
        <span id={`${formId}-notes-hint`} className="item-form__hint">
          Why you saved it, in your own words.
        </span>
      </div>

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
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="accent"
          icon={mode === "create" ? Plus : Check}
          disabled={submitting || previewImageUploading}
        >
          {mode === "create" ? "Add item" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
