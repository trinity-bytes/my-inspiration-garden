import { type StoredMedia, uploadMedia } from "../api/endpoints";
import { loadVideoFrame } from "./video-frame";

/**
 * Bounds the poster's shorter side: the card thumbnail and the detail
 * player's poster never need more, and the original frame of a 4K clip would
 * just be a heavier upload.
 */
const POSTER_SHORT_SIDE_PX = 960;
const POSTER_QUALITY = 0.85;

/**
 * Captures a poster frame from a video file the owner is uploading and stores
 * it as an image (`POST /api/media`). The canvas paints its card from this
 * poster (through its WebP thumbnail) instead of downloading the video, and the
 * detail player shows it until playback. Best effort: resolves `null` when the
 * browser cannot decode the video or encode the frame, so the video upload
 * itself never fails because of its poster.
 */
export async function uploadVideoPosterFile(file: File): Promise<StoredMedia | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const frame = await loadVideoFrame(objectUrl, POSTER_SHORT_SIDE_PX, POSTER_SHORT_SIDE_PX);
    if (!frame) return null;
    const blob = await new Promise<Blob | null>((resolve) =>
      frame.toBlob(resolve, "image/webp", POSTER_QUALITY),
    );
    if (!blob) return null;
    return await uploadMedia(new File([blob], "poster.webp", { type: blob.type }));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
