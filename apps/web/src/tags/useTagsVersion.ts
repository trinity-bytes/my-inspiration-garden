import { useSyncExternalStore } from "react";
import { getTagsVersion, subscribeTagsVersion } from "./tags-store";

/** Include the returned number in a `useEffect` dependency array to refetch tags after the tag manager changes one. */
export function useTagsVersion(): number {
  return useSyncExternalStore(subscribeTagsVersion, getTagsVersion, getTagsVersion);
}
