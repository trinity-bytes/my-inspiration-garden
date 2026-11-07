import { CircleAlert } from "lucide-react";
import type { ItemFormState } from "../item-form-state";
import { FilePicker } from "./FilePicker";
import type { AsyncStatus, UpdateKindData } from "./types";

export interface ImageFieldsProps {
  formId: string;
  image: ItemFormState["image"];
  /** The banner says what's wrong; the image field itself also carries it. */
  imageMissing: boolean;
  uploadStatus: AsyncStatus;
  pickedFileName: string | null;
  onFileChosen: (file: File | undefined) => void;
  updateKindData: UpdateKindData;
}

export function ImageFields({
  formId,
  image,
  imageMissing,
  uploadStatus,
  pickedFileName,
  onFileChosen,
  updateKindData,
}: ImageFieldsProps) {
  return (
    <>
      <div className="item-form__field">
        <label htmlFor={`${formId}-image-file`}>Image file</label>
        <FilePicker
          id={`${formId}-image-file`}
          accept="image/*"
          buttonLabel="Upload image"
          fileName={pickedFileName}
          invalid={imageMissing}
          onChange={(event) => onFileChosen(event.target.files?.[0])}
        />
        <span className="item-form__hint">Or paste a screenshot with Ctrl+V (⌘V on Mac).</span>
        {imageMissing && (
          <span className="field__error">
            <CircleAlert size={14} aria-hidden="true" />
            Required for image items.
          </span>
        )}
        {uploadStatus === "loading" && <span className="item-form__hint">Uploading…</span>}
        {uploadStatus === "error" && (
          <span className="field__error">
            <CircleAlert size={14} aria-hidden="true" />
            Upload failed.
          </span>
        )}
        {image.r2Key && (
          <img className="item-form__preview" src={`/api/media/${image.r2Key}`} alt="Uploaded" />
        )}
      </div>
      <div className="item-form__field">
        <label htmlFor={`${formId}-image-description`}>Description</label>
        <textarea
          id={`${formId}-image-description`}
          aria-describedby={`${formId}-image-description-hint`}
          value={image.description ?? ""}
          onChange={(event) => updateKindData("image", { description: event.target.value })}
        />
        <span id={`${formId}-image-description-hint`} className="item-form__hint">
          What the image shows.
        </span>
      </div>
    </>
  );
}
