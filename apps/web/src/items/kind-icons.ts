import type { ItemKind } from "@garden/shared";
import { ALargeSmall, Image, Link, type LucideIcon, Palette, Type, Video } from "lucide-react";

/** One Lucide icon per item kind (Figma Components `25:57`), shared by every list and picker. */
export const KIND_ICONS: Record<ItemKind, LucideIcon> = {
  image: Image,
  link: Link,
  text: Type,
  video: Video,
  palette: Palette,
  font: ALargeSmall,
};

/** Display label per item kind. */
export const KIND_LABELS: Record<ItemKind, string> = {
  image: "Image",
  link: "Link",
  text: "Text",
  video: "Video",
  palette: "Palette",
  font: "Font",
};
