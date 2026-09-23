import { IMAGE_MIME_TYPES, VIDEO_MIME_TYPES } from "./magic-bytes";

/**
 * Default upload caps, well under Cloudflare Workers' request body limit
 * (100 MB on all plans as of this writing) so a single oversized upload
 * can't exhaust the R2 storage budget. Configurable per-deployment via the
 * `MAX_IMAGE_BYTES`/`MAX_VIDEO_BYTES` wrangler vars.
 */
export const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const DEFAULT_MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

export interface MediaLimitsEnv {
  MAX_IMAGE_BYTES?: string;
  MAX_VIDEO_BYTES?: string;
}

export function maxBytesForMime(mime: string, env: MediaLimitsEnv): number {
  if (VIDEO_MIME_TYPES.has(mime as never)) {
    const override = Number(env.MAX_VIDEO_BYTES);
    return Number.isFinite(override) && override > 0 ? override : DEFAULT_MAX_VIDEO_BYTES;
  }
  if (IMAGE_MIME_TYPES.has(mime as never)) {
    const override = Number(env.MAX_IMAGE_BYTES);
    return Number.isFinite(override) && override > 0 ? override : DEFAULT_MAX_IMAGE_BYTES;
  }
  const override = Number(env.MAX_IMAGE_BYTES);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_MAX_IMAGE_BYTES;
}
