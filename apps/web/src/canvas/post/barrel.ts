import * as THREE from "three";
import { lensScale } from "../distortion";
import { BARREL_FRAGMENT_GLSL } from "../shaders/barrel";
import { FULLSCREEN_VERTEX_GLSL } from "../shaders/fullscreen-vertex";

/**
 * Full-screen barrel-distortion post-process. Renders the already-composed
 * scene render target to the visible canvas, subtly bending it for a
 * spherical feel and fading softly at the edges. See
 * `shaders/barrel.ts` and `../distortion.ts` for the forward/inverse math
 * this mirrors in GLSL.
 */
interface BarrelUniforms {
  u_scene: { value: THREE.Texture };
  u_k: { value: number };
  u_lensScale: { value: THREE.Vector2 };
  [key: string]: THREE.IUniform;
}

export class BarrelPass {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly uniforms: BarrelUniforms;

  constructor(sceneTexture: THREE.Texture, k: number) {
    this.uniforms = {
      u_scene: { value: sceneTexture },
      u_k: { value: k },
      u_lensScale: { value: new THREE.Vector2(1, 1) },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX_GLSL,
      fragmentShader: BARREL_FRAGMENT_GLSL,
      depthTest: false,
      depthWrite: false,
      uniforms: this.uniforms,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
  }

  setViewport(viewport: { width: number; height: number }): void {
    const scale = lensScale(viewport);
    this.uniforms.u_lensScale.value.set(scale.x, scale.y);
  }

  setK(k: number): void {
    this.uniforms.u_k.value = k;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
