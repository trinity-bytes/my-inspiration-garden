import * as THREE from "three";
import { FULLSCREEN_VERTEX_GLSL } from "../shaders/fullscreen-vertex";
import { HAZE_FRAGMENT_GLSL } from "../shaders/haze";
import type { Vec2 } from "../types";

export interface HazeLayerOptions {
  parallax: number;
}

/**
 * Procedural transparent haze layer, drawn on top of the sky. Infinite by
 * construction (pure noise of world position); animation is paused
 * externally under `prefers-reduced-motion` by freezing the time uniform.
 */
interface HazeUniforms {
  u_resolution: { value: THREE.Vector2 };
  u_worldOffset: { value: THREE.Vector2 };
  u_parallax: { value: number };
  u_time: { value: number };
  [key: string]: THREE.IUniform;
}

export class HazeLayer {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly uniforms: HazeUniforms;

  constructor(options: HazeLayerOptions) {
    this.uniforms = {
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_worldOffset: { value: new THREE.Vector2(0, 0) },
      u_parallax: { value: options.parallax },
      u_time: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX_GLSL,
      fragmentShader: HAZE_FRAGMENT_GLSL,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: this.uniforms,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  update(
    resolution: { width: number; height: number },
    worldOffset: Vec2,
    timeSeconds: number,
  ): void {
    this.uniforms.u_resolution.value.set(resolution.width, resolution.height);
    this.uniforms.u_worldOffset.value.set(worldOffset.x, worldOffset.y);
    this.uniforms.u_time.value = timeSeconds;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
