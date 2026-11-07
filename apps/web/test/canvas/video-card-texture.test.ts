import type { Item } from "@garden/shared";
import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { paintItemCardCanvas } from "../../src/canvas/card-painters";
import type { CardInstance } from "../../src/canvas/item-layout";
import { type CardFrame, CardLayer } from "../../src/canvas/layers/cards";

vi.mock("../../src/canvas/card-painters", () => ({
  paintItemCardCanvas: vi.fn(async () => document.createElement("canvas")),
  paintPhotoCanvas: vi.fn(),
}));
vi.mock("../../src/canvas/placeholder-texture", () => ({
  createCardCanvasTexture: () => new THREE.Texture(),
  createPlaceholderTexture: () => new THREE.Texture(),
  paintPlaceholderCanvas: () => document.createElement("canvas"),
}));

it("overrides only the activated cell and restores cached posters without disposing the live texture", async () => {
  const layer = new CardLayer({
    maxPoolSize: 2,
    textureCacheSize: 2,
    apiBaseUrl: "",
    renderOrder: 1,
  });
  const item = { id: "clip", kind: "video", data: { provider: "file", r2Key: "clip.mp4" } } as Item;
  const instances = ["a", "b"].map((key, index) => ({
    key,
    item,
    columnIndex: index,
    row: 0,
    worldRect: { x: index * 200, y: 0, width: 160, height: 90 },
  })) as CardInstance[];
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
  layer.update(instances, frame, null);
  await Promise.resolve();
  await Promise.resolve();
  const materials = layer.group.children.map(
    (mesh) => (mesh as THREE.Mesh).material as THREE.ShaderMaterial,
  );
  const poster = materials[0]?.uniforms.u_map?.value;
  expect(poster).toBeInstanceOf(THREE.Texture);
  const video = document.createElement("video");
  Object.defineProperties(video, {
    readyState: { value: 2 },
    videoWidth: { value: 1920 },
    videoHeight: { value: 1080 },
  });
  const live = new THREE.VideoTexture(video);
  const dispose = vi.spyOn(live, "dispose");
  layer.setPlayback("a", live);
  layer.update(instances, frame, null);
  expect(materials[0]?.uniforms.u_map?.value).toBe(live);
  expect(materials[1]?.uniforms.u_map?.value).toBe(poster);
  layer.setPlayback(null, null);
  expect(materials[0]?.uniforms.u_map?.value).toBe(poster);
  layer.dispose();
  expect(dispose).not.toHaveBeenCalled();
  live.dispose();
});

it("reveals ready playback independently of pending posters and resets readiness on stop or reassignment", () => {
  vi.mocked(paintItemCardCanvas).mockImplementationOnce(() => new Promise(() => {}));
  vi.mocked(paintItemCardCanvas).mockImplementationOnce(() => new Promise(() => {}));
  const layer = new CardLayer({
    maxPoolSize: 1,
    textureCacheSize: 2,
    apiBaseUrl: "",
    renderOrder: 1,
  });
  const item = { id: "clip", kind: "video", data: { provider: "file", r2Key: "clip.mp4" } } as Item;
  const instance = {
    key: "a",
    item,
    columnIndex: 0,
    row: 0,
    worldRect: { x: 0, y: 0, width: 160, height: 90 },
  } as CardInstance;
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
  layer.update([instance], frame, null);
  const video = document.createElement("video");
  Object.defineProperties(video, {
    readyState: { value: 2 },
    videoWidth: { value: 1920 },
    videoHeight: { value: 1080 },
  });
  const live = new THREE.VideoTexture(video);
  const uniforms = ((layer.group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial)
    .uniforms;
  layer.setPlayback("a", live);
  layer.update([instance], frame, null);
  expect(uniforms.u_map?.value).toBe(live);
  expect(uniforms.u_reveal?.value).toBe(1);
  layer.setPlayback(null, null);
  expect(uniforms.u_reveal?.value).toBe(0);
  layer.setPlayback("a", live);
  layer.update([instance], frame, null);
  const other = { ...instance, key: "b", item: { ...item, id: "other" } };
  layer.update([other], frame, null);
  expect(uniforms.u_reveal?.value).toBe(0);
  expect(uniforms.u_map?.value).not.toBe(live);
  layer.dispose();
  live.dispose();
});
