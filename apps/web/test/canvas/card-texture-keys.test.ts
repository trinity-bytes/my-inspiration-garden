import type { Item } from "@garden/shared";
import * as THREE from "three";
import { beforeEach, expect, it, vi } from "vitest";
import { paintItemCardCanvas, paintPhotoCanvas } from "../../src/canvas/card-painters";
import type { CardInstance } from "../../src/canvas/item-layout";
import { type CardFrame, CardLayer } from "../../src/canvas/layers/cards";
import { makeItem } from "../fixtures/items";

vi.mock("../../src/canvas/card-painters", () => ({
  paintItemCardCanvas: vi.fn(async () => document.createElement("canvas")),
  paintPhotoCanvas: vi.fn(async () => document.createElement("canvas")),
}));
vi.mock("../../src/canvas/placeholder-texture", () => ({
  createCardCanvasTexture: () => new THREE.Texture(),
  createPlaceholderTexture: () => new THREE.Texture(),
  paintPlaceholderCanvas: () => document.createElement("canvas"),
}));

const frame: CardFrame = {
  worldOffset: { x: 0, y: 0 },
  viewportWidth: 800,
  viewportHeight: 600,
  reducedMotion: true,
  dtSeconds: 1,
  layerOpacity: 1,
  sheenCenterPx: 0,
  sheenHalfWidthPx: 1,
};

function instance(item: Item, width = 160, height = 90): CardInstance {
  return { key: "0,0", columnIndex: 0, row: 0, item, worldRect: { x: 0, y: 0, width, height } };
}

function layer(): CardLayer {
  return new CardLayer({ maxPoolSize: 1, textureCacheSize: 4, apiBaseUrl: "", renderOrder: 1 });
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function mapOf(cards: CardLayer): THREE.Texture | null {
  const mesh = cards.group.children[0] as THREE.Mesh;
  return (mesh.material as THREE.ShaderMaterial).uniforms.u_map?.value ?? null;
}

beforeEach(() => {
  vi.mocked(paintItemCardCanvas).mockClear();
  vi.mocked(paintPhotoCanvas).mockClear();
});

it("repaints a composed card after its item is edited, even in the same cell", async () => {
  const cards = layer();
  const original = makeItem("edited", "text", { body: "before" });
  cards.update([instance(original)], frame, null);
  await settle();
  const before = mapOf(cards);
  const edited = makeItem(
    "edited",
    "text",
    { body: "after" },
    { updatedAt: "2026-02-01T00:00:00.000Z" },
  );
  cards.update([instance(edited)], frame, null);
  await settle();
  expect(paintItemCardCanvas).toHaveBeenCalledTimes(2);
  expect(vi.mocked(paintItemCardCanvas).mock.calls[1]?.[0]).toBe(edited);
  expect(mapOf(cards)).not.toBe(before);
  cards.dispose();
});

it("keeps the cached composed texture while neither the item nor the size changes", async () => {
  const cards = layer();
  const item = makeItem("steady", "text");
  cards.update([instance(item)], frame, null);
  await settle();
  cards.update([instance(item)], frame, null);
  await settle();
  expect(paintItemCardCanvas).toHaveBeenCalledTimes(1);
  cards.dispose();
});

it("repaints a composed card at the new size after a resize", async () => {
  const cards = layer();
  const item = makeItem("resized", "text");
  cards.update([instance(item, 160, 90)], frame, null);
  await settle();
  cards.update([instance(item, 240, 135)], frame, null);
  await settle();
  expect(paintItemCardCanvas).toHaveBeenCalledTimes(2);
  expect(vi.mocked(paintItemCardCanvas).mock.calls[1]?.slice(1, 3)).toEqual([240, 135]);
  cards.dispose();
});

it("repaints a photo card at the new size after a resize", async () => {
  const cards = layer();
  const item = makeItem("photo", "image");
  cards.update([instance(item, 160, 120)], frame, null);
  await settle();
  cards.update([instance(item, 240, 180)], frame, null);
  await settle();
  expect(paintPhotoCanvas).toHaveBeenCalledTimes(2);
  expect(vi.mocked(paintPhotoCanvas).mock.calls[1]?.slice(1, 3)).toEqual([240, 180]);
  cards.dispose();
});

it("reloads a photo card whose image was replaced", async () => {
  const cards = layer();
  cards.update([instance(makeItem("swap", "image", { r2Key: "media/old.png" }))], frame, null);
  await settle();
  const replaced = makeItem(
    "swap",
    "image",
    { r2Key: "media/new.png" },
    { updatedAt: "2026-02-01T00:00:00.000Z" },
  );
  cards.update([instance(replaced)], frame, null);
  await settle();
  expect(paintPhotoCanvas).toHaveBeenCalledTimes(2);
  expect(vi.mocked(paintPhotoCanvas).mock.calls[1]?.[0]).toBe("/api/media/media/new.png");
  cards.dispose();
});
