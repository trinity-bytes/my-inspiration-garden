import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createCardCanvasTexture,
  createDeviceCanvas,
  MAX_TEXTURE_EDGE_PX,
} from "../../src/canvas/placeholder-texture";

describe("createDeviceCanvas", () => {
  it("paints one texel per device pixel on a 1x screen", () => {
    const canvas = createDeviceCanvas(350, 450, 1);
    expect([canvas.width, canvas.height]).toEqual([350, 450]);
  });

  it("doubles the resolution on a 2x (Retina) screen so the card never has to shrink", () => {
    const canvas = createDeviceCanvas(350, 450, 2);
    expect([canvas.width, canvas.height]).toEqual([700, 900]);
  });

  it("caps the device pixel ratio at 2, like the engine", () => {
    const canvas = createDeviceCanvas(350, 450, 3);
    expect([canvas.width, canvas.height]).toEqual([700, 900]);
  });

  it("caps the longer edge so a huge card cannot allocate an unbounded texture", () => {
    const canvas = createDeviceCanvas(400, 1000, 2);
    expect(canvas.height).toBe(MAX_TEXTURE_EDGE_PX);
    expect(canvas.width).toBe(Math.round(400 * (MAX_TEXTURE_EDGE_PX / 1000)));
  });
});

describe("createCardCanvasTexture", () => {
  it("skips mipmaps so uploading a card that scrolls into view stays cheap", () => {
    const texture = createCardCanvasTexture(document.createElement("canvas"));
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  });
});
