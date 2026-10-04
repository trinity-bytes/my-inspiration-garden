import { isSafeFetchUrl } from "@garden/shared";
import { importRemoteImage } from "./media-store";

type ImportEnv = Parameters<typeof importRemoteImage>[0];

/**
 * For link items, replaces an http(s) `data.previewImage` with the R2 key of the
 * imported copy. Best effort: on any failure the original value is kept, so a
 * broken preview never blocks saving. Already-stored keys are left untouched.
 */
export async function importLinkPreview<T extends { kind: string; data?: unknown }>(
  env: ImportEnv,
  fetchImpl: typeof fetch,
  input: T,
): Promise<T> {
  if (input.kind !== "link" || !input.data || typeof input.data !== "object") return input;
  const data = input.data as { previewImage?: unknown };
  const preview = data.previewImage;
  if (typeof preview !== "string" || !/^https?:\/\//i.test(preview) || !isSafeFetchUrl(preview)) {
    return input;
  }

  try {
    const result = await importRemoteImage(env, fetchImpl, preview);
    if (!result.ok) return input;
    return { ...input, data: { ...data, previewImage: result.r2Key } };
  } catch {
    return input;
  }
}
