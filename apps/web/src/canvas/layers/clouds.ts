import * as THREE from "three";
import {
  type CloudLayerConfig,
  cellCountInRange,
  clampPoolSize,
  cloudForCell,
  visibleCellRange,
} from "../cloud-field";
import { CLOUD_FRAGMENT_GLSL, CLOUD_VERTEX_GLSL } from "../shaders/cloud";
import type { Vec2 } from "../types";

export interface CloudLayerRuntimeConfig extends CloudLayerConfig {
  /** Parallax factor relative to the world offset (near = larger/faster). */
  parallax: number;
  /** Extra cells rendered beyond the viewport so sprites don't pop in. */
  marginCells: number;
  maxPoolSize: number;
  /** World-space z depth (used only for consistent render/sort order). */
  zDepth: number;
  baseSpriteSizePx: number;
}

interface CloudUniforms {
  u_map: { value: THREE.Texture };
  u_opacity: { value: number };
  [key: string]: THREE.IUniform;
}

interface PoolEntry {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  uniforms: CloudUniforms;
}

/**
 * One parallax layer of deterministically-placed cloud sprites. Cell
 * placement comes from `cloud-field.ts` (pure, hash-based); this class
 * only owns the three.js pool and keeps it in sync with the visible cell
 * range each frame. The pool is created lazily up to `maxPoolSize` and
 * never grows past it — extra sprites are simply not shown.
 */
export type CloudSpriteTextures = readonly [
  THREE.Texture,
  THREE.Texture,
  THREE.Texture,
  THREE.Texture,
];

export class CloudLayer {
  readonly group: THREE.Group;
  private readonly config: CloudLayerRuntimeConfig;
  private readonly textures: CloudSpriteTextures;
  private readonly pool: PoolEntry[] = [];

  constructor(textures: CloudSpriteTextures, config: CloudLayerRuntimeConfig) {
    this.textures = textures;
    this.config = config;
    this.group = new THREE.Group();
    this.group.position.z = config.zDepth;
  }

  private ensurePoolSize(size: number): void {
    while (this.pool.length < size) {
      const uniforms: CloudUniforms = {
        u_map: { value: this.textures[0] },
        u_opacity: { value: 1 },
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: CLOUD_VERTEX_GLSL,
        fragmentShader: CLOUD_FRAGMENT_GLSL,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendEquation: THREE.AddEquation,
        uniforms,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, material, uniforms });
    }
  }

  /** `centerWorld` must already be in this layer's parallax-space (worldOffset * parallax). */
  update(centerWorld: Vec2, viewportWidth: number, viewportHeight: number): void {
    const { cellSize, marginCells, maxPoolSize, baseSpriteSizePx } = this.config;
    const range = visibleCellRange(
      {
        centerX: centerWorld.x,
        centerY: centerWorld.y,
        width: viewportWidth,
        height: viewportHeight,
      },
      cellSize,
      marginCells,
    );
    const wantedCount = clampPoolSize(cellCountInRange(range), maxPoolSize);
    this.ensurePoolSize(wantedCount);

    let used = 0;
    for (let cellX = range.minX; cellX <= range.maxX && used < maxPoolSize; cellX++) {
      for (let cellY = range.minY; cellY <= range.maxY && used < maxPoolSize; cellY++) {
        const placement = cloudForCell(cellX, cellY, this.config);
        if (!placement) {
          continue;
        }
        const entry = this.pool[used];
        if (!entry) {
          break;
        }
        used++;

        const worldX = (cellX + placement.offsetX) * cellSize;
        const worldY = (cellY + placement.offsetY) * cellSize;
        const size = baseSpriteSizePx * placement.scale;

        entry.mesh.position.set(worldX, worldY, 0);
        entry.mesh.scale.set(placement.flipX ? -size : size, size, 1);
        entry.mesh.visible = true;
        entry.uniforms.u_map.value = this.textures[placement.spriteIndex - 1] ?? this.textures[0];
        entry.uniforms.u_opacity.value = placement.opacity;
      }
    }

    for (let i = used; i < this.pool.length; i++) {
      const entry = this.pool[i];
      if (entry) {
        entry.mesh.visible = false;
      }
    }
  }

  dispose(): void {
    for (const entry of this.pool) {
      entry.mesh.geometry.dispose();
      entry.material.dispose();
    }
    this.pool.length = 0;
  }
}
