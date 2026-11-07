import type { Item } from "@garden/shared";
import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { paintItemCardCanvas } from "../../src/canvas/card-painters";
import type { CardInstance } from "../../src/canvas/item-layout";
import { type CardFrame, CardLayer } from "../../src/canvas/layers/cards";
import { TextureRegistry } from "../../src/canvas/texture-registry";

vi.mock("../../src/canvas/card-painters", () => ({
  paintItemCardCanvas: vi.fn(async () => document.createElement("canvas")),
  paintPhotoCanvas: vi.fn(),
}));
vi.mock("../../src/canvas/placeholder-texture", () => ({
  createCardCanvasTexture: () => new THREE.Texture(),
  createPlaceholderTexture: () => new THREE.Texture(),
  deviceTextureSize: (width: number, height: number) => ({ width, height }),
  paintPlaceholderCanvas: () => document.createElement("canvas"),
}));

function performanceInstance(id: string, x: number): CardInstance {
  return {
    key: id,
    columnIndex: x,
    row: 0,
    item: { id, kind: "text", data: { body: id } } as Item,
    worldRect: { x, y: 0, width: 160, height: 90 },
  };
}
const performanceFrame: CardFrame = {
  worldOffset: { x: 0, y: 0 },
  viewportWidth: 800,
  viewportHeight: 600,
  reducedMotion: true,
  dtSeconds: 1,
  layerOpacity: 1,
  sheenCenterPx: 0,
  sheenHalfWidthPx: 1,
};

it("retains meshes and texture assignments for surviving cards when earlier cards leave", async () => {
  const layer = new CardLayer({
    maxPoolSize: 3,
    textureCacheSize: 3,
    apiBaseUrl: "",
    renderOrder: 1,
  });
  const loads = vi.spyOn(TextureRegistry.prototype, "load");
  try {
    const a = performanceInstance("stable-a", 0);
    const b = performanceInstance("stable-b", 200);
    const c = performanceInstance("stable-c", 400);
    layer.update([a, b, c], performanceFrame, null);
    await Promise.resolve();
    await Promise.resolve();
    const bMesh = layer.group.children.find((mesh) => mesh.position.x === b.worldRect.x);
    const cMesh = layer.group.children.find((mesh) => mesh.position.x === c.worldRect.x);
    const count = loads.mock.calls.length;
    layer.update([b, c, performanceInstance("stable-d", 600)], performanceFrame, "stable-b");
    expect(loads.mock.calls.length - count).toBe(1);
    expect(layer.group.children.find((mesh) => mesh.position.x === b.worldRect.x)).toBe(bMesh);
    expect(layer.group.children.find((mesh) => mesh.position.x === c.worldRect.x)).toBe(cMesh);
  } finally {
    layer.dispose();
    loads.mockRestore();
  }
});

it("releases hidden cards so their textures can be evicted under memory pressure", async () => {
  const layer = new CardLayer({
    maxPoolSize: 2,
    textureCacheSize: 1,
    apiBaseUrl: "",
    renderOrder: 1,
  });
  const visible = [performanceInstance("evict-a", 0), performanceInstance("evict-b", 200)];
  layer.update(visible, performanceFrame, null);
  await Promise.resolve();
  await Promise.resolve();
  // Fresh loads apply on the next frame (per-frame upload budget).
  layer.update(visible, performanceFrame, null);
  const textures = layer.group.children.map(
    (mesh) =>
      ((mesh as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.u_map
        ?.value as THREE.Texture,
  );
  const disposals = textures.map((texture) => vi.spyOn(texture, "dispose"));
  layer.update([], performanceFrame, null);
  layer.update([performanceInstance("evict-c", 400)], performanceFrame, null);
  await Promise.resolve();
  await Promise.resolve();
  expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
  layer.dispose();
});

it("retires pending assignments on hide and does not restore a hidden card from a late load", async () => {
  let resolve!: (canvas: HTMLCanvasElement) => void;
  vi.mocked(paintItemCardCanvas).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const layer = new CardLayer({
    maxPoolSize: 1,
    textureCacheSize: 1,
    apiBaseUrl: "",
    renderOrder: 1,
  });
  layer.update([performanceInstance("late", 0)], performanceFrame, null);
  layer.update([], performanceFrame, null);
  resolve(document.createElement("canvas"));
  await Promise.resolve();
  await Promise.resolve();
  const mesh = layer.group.children[0] as THREE.Mesh;
  expect(mesh.visible).toBe(false);
  expect((mesh.material as THREE.ShaderMaterial).uniforms.u_map?.value).toBeNull();
  layer.update([performanceInstance("late", 0)], performanceFrame, null);
  expect((mesh.material as THREE.ShaderMaterial).uniforms.u_map?.value).toBeInstanceOf(
    THREE.Texture,
  );
  layer.dispose();
});

it("rejects duplicate assignment keys in one frame instead of sharing a mesh", () => {
  const layer = new CardLayer({
    maxPoolSize: 2,
    textureCacheSize: 2,
    apiBaseUrl: "",
    renderOrder: 1,
  });
  try {
    layer.update([performanceInstance("dup-a", 0)], performanceFrame, null);
    expect(() =>
      layer.update(
        [performanceInstance("dup-b", 0), performanceInstance("dup-b", 200)],
        performanceFrame,
        null,
      ),
    ).toThrow(/duplicate assignment keys/);
  } finally {
    layer.dispose();
  }
});

it("applies textures that arrive asynchronously at most two per frame, cached ones at once", async () => {
  const layer = new CardLayer({
    maxPoolSize: 5,
    textureCacheSize: 10,
    apiBaseUrl: "",
    renderOrder: 1,
  });
  const instances = ["budget-a", "budget-b", "budget-c", "budget-d", "budget-e"].map((id, i) =>
    performanceInstance(id, i * 200),
  );
  const mapped = () =>
    layer.group.children.filter(
      (mesh) => ((mesh as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.u_map?.value,
    ).length;

  layer.update(instances, performanceFrame, null);
  await Promise.resolve();
  await Promise.resolve();
  expect(mapped()).toBe(0);

  layer.update(instances, performanceFrame, null);
  expect(mapped()).toBe(2);
  layer.update(instances, performanceFrame, null);
  expect(mapped()).toBe(4);
  layer.update(instances, performanceFrame, null);
  expect(mapped()).toBe(5);

  // Cached textures are already on the GPU: a card coming back shows at once.
  layer.update([], performanceFrame, null);
  layer.update(instances, performanceFrame, null);
  expect(mapped()).toBe(5);
  layer.dispose();
});
