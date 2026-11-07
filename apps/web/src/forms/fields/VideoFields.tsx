import { Sparkles, Video } from "lucide-react";
import { Button } from "../../components/Button/Button";
import { Select, type SelectOption } from "../../components/Select/Select";
import type { ItemFormState } from "../item-form-state";
import { FilePicker } from "./FilePicker";
import type { AsyncStatus, UpdateKindData } from "./types";

function isRemoteUrl(value: string | undefined): boolean {
  return value !== undefined && /^https?:\/\//i.test(value);
}

const VIDEO_PROVIDER_OPTIONS: SelectOption<ItemFormState["video"]["provider"]>[] = [
  { value: "youtube", label: "YouTube" },
  { value: "vimeo", label: "Vimeo" },
  { value: "file", label: "Uploaded file" },
];

export interface VideoFieldsProps {
  formId: string;
  url: string;
  video: ItemFormState["video"];
  unfurlStatus: AsyncStatus;
  uploadStatus: AsyncStatus;
  pickedFileName: string | null;
  onUrlChange: (url: string) => void;
  onDetectVideo: () => void;
  onFileChosen: (file: File | undefined) => void;
  updateKindData: UpdateKindData;
}

export function VideoFields({
  formId,
  url,
  video,
  unfurlStatus,
  uploadStatus,
  pickedFileName,
  onUrlChange,
  onDetectVideo,
  onFileChosen,
  updateKindData,
}: VideoFieldsProps) {
  const isEmbedProvider = video.provider === "youtube" || video.provider === "vimeo";
  return (
    <>
      {isEmbedProvider && (
        <label className="item-form__field" htmlFor={`${formId}-video-url`}>
          Video URL
          <div className="item-form__url-row">
            <span className="control-with-icon">
              <Video size={16} aria-hidden="true" />
              <input
                id={`${formId}-video-url`}
                type="url"
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                placeholder="https://"
              />
            </span>
            <Button
              icon={Sparkles}
              onClick={onDetectVideo}
              disabled={unfurlStatus === "loading" || url.trim().length === 0}
            >
              Detect video
            </Button>
          </div>
          {unfurlStatus === "loading" && <span className="item-form__hint">Detecting…</span>}
          {unfurlStatus === "error" && (
            <span className="item-form__hint">Doesn't look like a YouTube or Vimeo video URL.</span>
          )}
        </label>
      )}
      <label className="item-form__field" htmlFor={`${formId}-video-provider`}>
        Provider
        <Select
          id={`${formId}-video-provider`}
          value={video.provider}
          options={VIDEO_PROVIDER_OPTIONS}
          onChange={(provider) =>
            // An uploaded video's poster is an R2 key, meaningless (and an
            // invalid URL) for an embed provider's Thumbnail URL field.
            updateKindData(
              "video",
              provider === "file" || isRemoteUrl(video.thumbnail)
                ? { provider }
                : { provider, thumbnail: undefined },
            )
          }
        />
      </label>
      {isEmbedProvider && (
        <label className="item-form__field" htmlFor={`${formId}-video-embed`}>
          Embed URL
          <input
            id={`${formId}-video-embed`}
            type="url"
            value={video.embedUrl ?? ""}
            onChange={(event) => updateKindData("video", { embedUrl: event.target.value })}
          />
        </label>
      )}
      {video.provider === "file" && (
        <div className="item-form__field">
          <label htmlFor={`${formId}-video-file`}>Video file</label>
          <FilePicker
            id={`${formId}-video-file`}
            accept="video/*"
            buttonLabel="Upload video"
            fileName={pickedFileName}
            onChange={(event) => onFileChosen(event.target.files?.[0])}
          />
          {uploadStatus === "loading" && <span className="item-form__hint">Uploading…</span>}
          {uploadStatus === "error" && <span className="item-form__hint">Upload failed.</span>}
          {uploadStatus === "idle" && video.r2Key && video.thumbnail && (
            <span className="item-form__hint">Cover frame saved.</span>
          )}
        </div>
      )}
      {isEmbedProvider && (
        <label className="item-form__field" htmlFor={`${formId}-video-thumbnail`}>
          Thumbnail URL
          <input
            id={`${formId}-video-thumbnail`}
            type="url"
            value={video.thumbnail ?? ""}
            onChange={(event) => updateKindData("video", { thumbnail: event.target.value })}
          />
        </label>
      )}
    </>
  );
}
