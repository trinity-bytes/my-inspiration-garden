import type { ItemFormState } from "../item-form-state";

export type KindDataKey = "text" | "link" | "image" | "video" | "palette" | "font";

/** Merges `patch` into one kind's data slice of the form state. */
export type UpdateKindData = <K extends KindDataKey>(
  key: K,
  patch: Partial<ItemFormState[K]>,
) => void;

export type AsyncStatus = "idle" | "loading" | "error";
