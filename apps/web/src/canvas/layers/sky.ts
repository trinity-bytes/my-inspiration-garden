import * as THREE from "three";
import { FULLSCREEN_VERTEX_GLSL } from "../shaders/fullscreen-vertex";
import { SKY_FRAGMENT_GLSL } from "../shaders/sky";
import type { Vec2 } from "../types";

export interface SkyLayerOptions {
  texture: THREE.Texture;
  /** Parallax factor relative to the world offset (< 1 = distant, slow). */
  parallax: number;
}

/** One tile covers roughly 2.5 viewports on the larger axis. */
const TILE_VIEWPORTS = 2.5;

/**
 * Full-screen tiled sky background with a subtle drifting lavender/apricot
 * tint. Screen-anchored (ignores the 3D camera transform); see
 * `shaders/fullscreen-vertex.ts`.
 */
interface SkyUniforms {
  u_skyTex: { value: THREE.Texture };
  u_resolution: { value: THREE.Vector2 };
  u_worldOffset: { value: THREE.Vector2 };
  u_parallax: { value: number };
  u_tileWidth: { value: number };
  u_tileAspect: { value: number };
  u_time: { value: number };
  [key: string]: THREE.IUniform;
}

export class SkyLayer {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly uniforms: SkyUniforms;

  constructor(options: SkyLayerOptions) {
    const image = options.texture.image as { width: number; height: number } | undefined;
    const tileAspect = image && image.width > 0 ? image.height / image.width : 0.5;

    options.texture.wrapS = THREE.RepeatWrapping;
    options.texture.wrapT = THREE.RepeatWrapping;
    options.texture.colorSpace = THREE.SRGBColorSpace;

    this.uniforms = {
      u_skyTex: { value: options.texture },
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_worldOffset: { value: new THREE.Vector2(0, 0) },
      u_parallax: { value: options.parallax },
      u_tileWidth: { value: 2000 },
      u_tileAspect: { value: tileAspect },
      u_time: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX_GLSL,
      fragmentShader: SKY_FRAGMENT_GLSL,
      depthTest: false,
      depthWrite: false,
      uniforms: this.uniforms,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.renderOrder = -20;
    this.mesh.frustumCulled = false;
  }

  update(
    resolution: { width: number; height: number },
    worldOffset: Vec2,
    timeSeconds: number,
  ): void {
    this.uniforms.u_resolution.value.set(resolution.width, resolution.height);
    this.uniforms.u_worldOffset.value.set(worldOffset.x, worldOffset.y);
    this.uniforms.u_tileWidth.value =
      Math.max(resolution.width, resolution.height) * TILE_VIEWPORTS;
    this.uniforms.u_time.value = timeSeconds;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
