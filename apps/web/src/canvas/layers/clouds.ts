import * as THREE from "three";
import {
  type CloudLayerConfig,
  cellCountInRange,
  clampPoolSize,
  cloudForCell,
  visibleCellRange,
} from "../cloud-field";
import { spriteQuadCssSize } from "../max-sprite-size";
import { CLOUD_FRAGMENT_GLSL, CLOUD_VERTEX_GLSL } from "../shaders/cloud";
import type { Vec2 } from "../types";

/**
 * T8b-3 owner feedback (realism retune): cloud sprites may be drawn up to
 * 1.5x their texture's native resolution at high DPR — soft, blurred
 * atmospheric shapes tolerate mild upscaling far better than crisp cards
 * do, and without this the DPR=2 clamp would otherwise cap the bigger
 * T8b-3 base sprite size well short of its intended on-screen size (see
 * max-sprite-size.ts's `maxUpscaleFactor`). Cards (layers/cards.ts) keep
 * the strict default (1, no upscale) — this constant is cloud-only.
 */
const CLOUD_MAX_UPSCALE_FACTOR = 1.5;

export interface CloudLayerRuntimeConfig extends CloudLayerConfig {
  /** Parallax factor relative to the world offset (near = larger/faster). From cloud-depth.ts. */
  parallax: number;
  /** Extra cells rendered beyond the viewport so sprites don't pop in. */
  marginCells: number;
  maxPoolSize: number;
  /** World-space z depth (used only for consistent render/sort order). */
  zDepth: number;
  baseSpriteSizePx: number;
  /** Multiplier applied to every sprite's requested size. From cloud-depth.ts. */
  sizeScale: number;
  /** How much sprite color mixes toward the atmosphere color, in [0, 1]. From cloud-depth.ts. */
  atmosphereMix: number;
  /** three.js renderOrder: strictly increasing with depth so nearer layers always draw on top. From cloud-depth.ts. */
  renderOrder: number;
}

interface CloudUniforms {
  u_map: { value: THREE.Texture };
  u_opacity: { value: number };
  u_atmosphereMix: { value: number };
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
  private readonly textureSizes: readonly { width: number; height: number }[];
  private readonly pool: PoolEntry[] = [];

  constructor(textures: CloudSpriteTextures, config: CloudLayerRuntimeConfig) {
    this.textures = textures;
    this.config = config;
    this.group = new THREE.Group();
    this.group.position.z = config.zDepth;
    // Explicit draw order (depthTest is off): three.js sorts transparent
    // objects by renderOrder ascending, so a strictly-increasing-with-depth
    // value here guarantees a nearer layer always draws over a farther one,
    // independent of z position or camera distance.
    this.group.renderOrder = config.renderOrder;
    // Each quad keeps its texture's aspect ratio, so both dimensions are
    // needed; a missing image falls back to a square of the base size.
    this.textureSizes = textures.map((texture) => {
      const image = texture.image as { width: number; height: number } | undefined;
      return image
        ? { width: image.width, height: image.height }
        : { width: config.baseSpriteSizePx, height: config.baseSpriteSizePx };
    });
  }

  private ensurePoolSize(size: number): void {
    while (this.pool.length < size) {
      const uniforms: CloudUniforms = {
        u_map: { value: this.textures[0] },
        u_opacity: { value: 1 },
        u_atmosphereMix: { value: this.config.atmosphereMix },
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
      mesh.renderOrder = this.config.renderOrder;
      this.group.add(mesh);
      this.pool.push({ mesh, material, uniforms });
    }
  }

  /**
   * `centerWorld` must already be in this layer's parallax-space
   * (`-worldOffset * parallax` — see `coords.ts`: this is the world point
   * that screenToWorld maps the viewport center to). `dpr` clamps each
   * sprite's on-screen size to its texture's own resolution.
   */
  update(centerWorld: Vec2, viewportWidth: number, viewportHeight: number, dpr: number): void {
    const { cellSize, marginCells, maxPoolSize, baseSpriteSizePx, sizeScale } = this.config;
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
        const requestedWidth = baseSpriteSizePx * sizeScale * placement.scale;
        const texture = this.textureSizes[placement.spriteIndex - 1] ?? {
          width: baseSpriteSizePx,
          height: baseSpriteSizePx,
        };
        const { width, height } = spriteQuadCssSize(
          requestedWidth,
          texture.width,
          texture.height,
          dpr,
          CLOUD_MAX_UPSCALE_FACTOR,
        );

        // Y is negated: cell placement is in this engine's world convention
        // (y-down, canvas/coords.ts), but three.js's scene space is y-up
        // (matching the default orthographic camera's +Y-up, unrotated).
        entry.mesh.position.set(worldX, -worldY, 0);
        entry.mesh.scale.set(placement.flipX ? -width : width, height, 1);
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
