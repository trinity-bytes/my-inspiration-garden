import { CircleAlert, Link, Sparkles, X } from "lucide-react";
import { resolveMediaRef } from "../../api/media-ref";
import { Button } from "../../components/Button/Button";
import { IconButton } from "../../components/IconButton/IconButton";
import type { ItemFormState } from "../item-form-state";
import { FilePicker } from "./FilePicker";
import type { AsyncStatus, UpdateKindData } from "./types";

export interface LinkFieldsProps {
  formId: string;
  url: string;
  link: ItemFormState["link"];
  unfurlStatus: AsyncStatus;
  uploadStatus: AsyncStatus;
  pickedFileName: string | null;
  onUrlChange: (url: string) => void;
  onFetchPreview: () => void;
  onPreviewFileChosen: (file: File | undefined) => void;
  onRemovePreviewImage: () => void;
  updateKindData: UpdateKindData;
}

export function LinkFields({
  formId,
  url,
  link,
  unfurlStatus,
  uploadStatus,
  pickedFileName,
  onUrlChange,
  onFetchPreview,
  onPreviewFileChosen,
  onRemovePreviewImage,
  updateKindData,
}: LinkFieldsProps) {
  return (
    <>
      <label className="item-form__field" htmlFor={`${formId}-url`}>
        URL
        <div className="item-form__url-row">
          <span className="control-with-icon">
            <Link size={16} aria-hidden="true" />
            <input
              id={`${formId}-url`}
              type="url"
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="https://"
            />
          </span>
          <Button
            icon={Sparkles}
            onClick={onFetchPreview}
            disabled={unfurlStatus === "loading" || url.trim().length === 0}
          >
            Fetch preview
          </Button>
        </div>
        {unfurlStatus === "error" && (
          <span className="field__error">
            <CircleAlert size={14} aria-hidden="true" />
            Could not fetch a preview. Fill in the details by hand.
          </span>
        )}
      </label>
      <label className="item-form__field" htmlFor={`${formId}-link-site`}>
        Site name
        <input
          id={`${formId}-link-site`}
          type="text"
          value={link.siteName ?? ""}
          onChange={(event) => updateKindData("link", { siteName: event.target.value })}
        />
      </label>
      <label className="item-form__field" htmlFor={`${formId}-link-description`}>
        Description
        <textarea
          id={`${formId}-link-description`}
          value={link.description ?? ""}
          onChange={(event) => updateKindData("link", { description: event.target.value })}
        />
      </label>
      <div className="item-form__field">
        <label htmlFor={`${formId}-link-preview-file`}>Preview image</label>
        <FilePicker
          id={`${formId}-link-preview-file`}
          accept="image/*"
          buttonLabel="Upload image"
          fileName={pickedFileName}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so picking the same file again (after removing it) still fires.
            event.target.value = "";
            onPreviewFileChosen(file);
          }}
        />
        <span className="item-form__hint">Or paste a screenshot with Ctrl+V (⌘V on Mac).</span>
        {uploadStatus === "loading" && <span className="item-form__hint">Uploading…</span>}
        {uploadStatus === "error" && (
          <span className="field__error">
            <CircleAlert size={14} aria-hidden="true" />
            Upload failed.
          </span>
        )}
        {link.previewImage && (
          <div className="item-form__preview-row">
            <img
              className="item-form__preview"
              src={resolveMediaRef(link.previewImage)}
              alt="Link preview"
            />
            <IconButton
              icon={X}
              label="Remove preview image"
              tooltipAlign="end"
              onClick={onRemovePreviewImage}
            />
          </div>
        )}
      </div>
    </>
  );
}
