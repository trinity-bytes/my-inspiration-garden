import type { Item } from "@garden/shared";
import * as THREE from "three";
import { cardEntryProgress, cardOpacity, cardScreenRect, entryScaleForCard } from "../card-fade";
import { cardHoverStyle } from "../card-hover";
import { paintItemCardCanvas, paintPhotoCanvas } from "../card-painters";
import { isStaleLoadCallback } from "../card-texture-token";
import { FrameJobQueue } from "../frame-job-queue";
import { type CardInstance, cardAssignmentKey } from "../item-layout";
import { createCardCanvasTexture, paintPlaceholderCanvas } from "../placeholder-texture";
import { CARD_FRAGMENT_GLSL, CARD_VERTEX_GLSL } from "../shaders/card";
import { TextureRegistry } from "../texture-registry";
import { thumbnailUrlForItem } from "../thumbnail-source";
import type { Vec2 } from "../types";

export interface CardLayerOptions {
  maxPoolSize: number;
  /** Max distinct textures kept resident; evicted textures are disposed (see `texture-registry.ts`). */
  textureCacheSize: number;
  apiBaseUrl: string;
  renderOrder: number;
  /** Uploads a texture to the GPU now (`WebGLRenderer.initTexture`), so its upload runs inside the per-frame job budget instead of during the next render. */
  uploadTexture: (texture: THREE.Texture) => void;
}

const CORNER_RADIUS_FRACTION = 0.08;
/** Main-thread time per frame spent painting and uploading card textures (see `frame-job-queue.ts`). */
const TEXTURE_WORK_BUDGET_MS = 4;

interface CardUniforms {
  u_map: { value: THREE.Texture | null };
  u_opacity: { value: number };
  u_aspect: { value: number };
  u_cornerRadius: { value: number };
  u_highlight: { value: number };
  [key: string]: THREE.IUniform;
}

interface PoolEntry {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  uniforms: CardUniforms;
  /** `cardAssignmentKey` of the instance this entry currently renders — reload triggers when this changes, not just the cell key (see `item-layout.ts`). */
  assignedKey: string | null;
  /** The texture cache key this entry currently holds a pin on (see `texture-registry.ts`), or `null` before its first assignment. Tracked separately from `assignedKey` because on a thumbnail load failure the entry re-pins to the placeholder key while keeping the same `assignedKey`. */
  pinnedTextureKey: string | null;
  loadToken: number;
}

/**
 * One dense, pooled layer of item cards (every visible cell has a card):
 * a bounded set of meshes is reassigned to whichever `CardInstance`s are
 * currently visible each frame (`item-layout.ts` computes that set; this
 * class only owns the three.js side). Cards draw over the solid
 * canvas background (see `engine.ts`'s `renderOrder`).
 */
export class CardLayer {
  readonly group: THREE.Group;
  private readonly options: CardLayerOptions;
  private readonly pool: PoolEntry[] = [];
  private readonly textures: TextureRegistry<THREE.Texture>;
  private readonly textureJobs = new FrameJobQueue();

  constructor(options: CardLayerOptions) {
    this.options = options;
    this.group = new THREE.Group();
    this.group.renderOrder = options.renderOrder;
    this.textures = new TextureRegistry<THREE.Texture>({
      maxSize: options.textureCacheSize,
      dispose: (texture) => texture.dispose(),
    });
  }

  private ensurePoolSize(size: number): void {
    while (this.pool.length < size) {
      const uniforms: CardUniforms = {
        u_map: { value: null },
        u_opacity: { value: 0 },
        u_aspect: { value: 1 },
        u_cornerRadius: { value: CORNER_RADIUS_FRACTION },
        u_highlight: { value: 0 },
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: CARD_VERTEX_GLSL,
        fragmentShader: CARD_FRAGMENT_GLSL,
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
      mesh.renderOrder = this.options.renderOrder;
      this.group.add(mesh);
      this.pool.push({
        mesh,
        material,
        uniforms,
        assignedKey: null,
        pinnedTextureKey: null,
        loadToken: 0,
      });
    }
  }

  /** Pins `entry` to `key` in the texture registry (protecting it from eviction while assigned), unpinning whatever key it held before. A no-op if already pinned to `key`. */
  private pinEntryTexture(entry: PoolEntry, key: string): void {
    if (entry.pinnedTextureKey === key) {
      return;
    }
    if (entry.pinnedTextureKey) {
      this.textures.unpin(entry.pinnedTextureKey);
    }
    entry.pinnedTextureKey = key;
    this.textures.pin(key);
  }

  /**
   * Paints a card canvas, then wraps and uploads it as a texture, each step as its own job in
   * `textureJobs` so a burst of cards entering the viewport spreads over several frames. Feeds a
   * `TextureRegistry.load` start callback: `paint` resolving `null` rejects.
   */
  private scheduleCanvasTexture(
    paint: () => Promise<HTMLCanvasElement | null>,
    resolve: (texture: THREE.Texture) => void,
    reject: () => void,
  ): void {
    this.textureJobs.enqueue(() => {
      paint().then((canvas) => {
        if (!canvas) {
          reject();
          return;
        }
        this.textureJobs.enqueue(() => {
          const texture = createCardCanvasTexture(canvas);
          this.options.uploadTexture(texture);
          resolve(texture);
        });
      }, reject);
    });
  }

  /** Dispatches to the raw full-bleed photo path (`image` — "no chrome", see `odd/tasks/garden-mvp.md`'s T9 scope) or the composed per-kind painted path (every other kind, `card-painters.ts`). */
  private assignTexture(entry: PoolEntry, item: Item, widthPx: number, heightPx: number): void {
    if (item.kind === "image") {
      this.assignPhotoTexture(entry, item, widthPx, heightPx);
      return;
    }
    this.assignComposedTexture(entry, item, widthPx, heightPx);
  }

  /**
   * Loads (or reuses from cache) the raw photo texture for an `image` item,
   * applying it to `entry` only if it is still assigned to the same
   * instance by the time an async load resolves (stale-load guard via
   * `loadToken`). Goes through `TextureRegistry.load` (dedupes concurrent
   * loads for the same key — the layout repeats items across cells, so
   * several entries can miss the cache for the same key in the same frame)
   * and pins the key `entry` currently wants (so it's never
   * evicted/disposed while this entry still renders it — see
   * `texture-registry.ts`).
   */
  private assignPhotoTexture(
    entry: PoolEntry,
    item: Item,
    widthPx: number,
    heightPx: number,
  ): void {
    const thumbnailUrl = thumbnailUrlForItem(item, this.options.apiBaseUrl);
    const cacheKey = thumbnailUrl ?? `placeholder:${item.id}`;
    const token = entry.loadToken;

    this.pinEntryTexture(entry, cacheKey);

    this.textures.load(
      cacheKey,
      (resolve, reject) =>
        this.scheduleCanvasTexture(
          async () =>
            thumbnailUrl
              ? paintPhotoCanvas(thumbnailUrl, widthPx, heightPx)
              : paintPlaceholderCanvas(item, widthPx, heightPx),
          resolve,
          reject,
        ),
      (texture) => {
        if (!isStaleLoadCallback(entry.loadToken, token)) {
          entry.uniforms.u_map.value = texture;
        }
      },
      () => {
        // Thumbnail failed to load (broken URL, network) — fall back to the
        // generic placeholder rather than leaving the card blank. Bail out
        // entirely if the entry has since moved on to a different instance
        // (`isStaleLoadCallback`): the entry's pin was already updated by
        // that newer assignment, and re-pinning here for the OLD item would
        // unpin the texture the entry currently renders and pin a
        // placeholder for an item it no longer represents (see
        // `card-texture-token.ts`). Re-pin to the fallback key so the
        // registry never disposes it while this entry still references it,
        // and route through `load` too (never `set` a value already known
        // to be cached — see `texture-registry.ts`'s identity no-op rule).
        if (isStaleLoadCallback(entry.loadToken, token)) {
          return;
        }
        const fallbackKey = `placeholder:${item.id}`;
        this.pinEntryTexture(entry, fallbackKey);
        this.textures.load(
          fallbackKey,
          (resolveFallback, rejectFallback) =>
            this.scheduleCanvasTexture(
              async () => paintPlaceholderCanvas(item, widthPx, heightPx),
              resolveFallback,
              rejectFallback,
            ),
          (texture) => {
            if (!isStaleLoadCallback(entry.loadToken, token)) {
              entry.uniforms.u_map.value = texture;
            }
          },
          () => {},
        );
      },
    );
  }

  /**
   * Composes the rich per-kind card texture (link/video/text/palette/font,
   * `card-painters.ts`) on a 2D canvas and wraps it as a
   * `THREE.CanvasTexture`, applying it only if `entry` is still assigned to
   * the same instance (stale-load guard, same convention as
   * `assignPhotoTexture`). `paintItemCardCanvas` never rejects — it falls
   * back to the generic placeholder internally — so the registry's error
   * path here is defensive only.
   */
  private assignComposedTexture(
    entry: PoolEntry,
    item: Item,
    widthPx: number,
    heightPx: number,
  ): void {
    const cacheKey = `composed:${item.kind}:${item.id}`;
    const token = entry.loadToken;

    this.pinEntryTexture(entry, cacheKey);

    this.textures.load(
      cacheKey,
      (resolve, reject) =>
        this.scheduleCanvasTexture(
          () =>
            paintItemCardCanvas(item, widthPx, heightPx).catch(() =>
              paintPlaceholderCanvas(item, widthPx, heightPx),
            ),
          resolve,
          reject,
        ),
      (texture) => {
        if (!isStaleLoadCallback(entry.loadToken, token)) {
          entry.uniforms.u_map.value = texture;
        }
      },
      () => {},
    );
  }

  /**
   * `instances` is the current visible-card set (`item-layout.ts`'s
   * `visibleCardInstances`, already computed by the caller — this class
   * does not do virtualization math itself). `worldOffset`/`viewport` drive
   * the fade-in opacity (`card-fade.ts`). A card always fills its column
   * slot: shrinking it to its texture's resolution broke the even gutter on
   * high-DPR screens, so composed textures are painted at device resolution
   * instead (`placeholder-texture.ts`'s `createDeviceCanvas`).
   */
  update(
    instances: readonly CardInstance[],
    worldOffset: Vec2,
    viewportWidth: number,
    viewportHeight: number,
    reducedMotion: boolean,
    hoveredKey: string | null,
  ): void {
    this.textureJobs.run(TEXTURE_WORK_BUDGET_MS);

    const wanted = Math.min(instances.length, this.options.maxPoolSize);
    this.ensurePoolSize(wanted);

    for (let i = 0; i < wanted; i++) {
      const instance = instances[i];
      const entry = this.pool[i];
      if (!instance || !entry) {
        continue;
      }

      const assignmentKey = cardAssignmentKey(instance);
      if (entry.assignedKey !== assignmentKey) {
        entry.assignedKey = assignmentKey;
        entry.loadToken++;
        this.assignTexture(
          entry,
          instance.item,
          instance.worldRect.width,
          instance.worldRect.height,
        );
      }

      const hover = cardHoverStyle(hoveredKey === instance.key);
      const screenRect = cardScreenRect(instance.worldRect, worldOffset, 1);
      const progress = cardEntryProgress(screenRect, viewportWidth, viewportHeight);
      // Same function `entryScaledWorldRect` feeds hit-testing (engine.ts) —
      // see card-fade.ts's `entryScaleForCard` doc.
      const entryScale = entryScaleForCard(
        instance.worldRect,
        worldOffset,
        { width: viewportWidth, height: viewportHeight },
        reducedMotion,
      );
      const scaleFactor = entryScale * hover.scale;
      const width = instance.worldRect.width * scaleFactor;
      const height = instance.worldRect.height * scaleFactor;

      // Y negated: mesh position is scene space (y-up); worldRect is this
      // engine's y-down world convention (coords.ts), same as every other layer.
      entry.mesh.position.set(instance.worldRect.x, -instance.worldRect.y, 0);
      entry.mesh.scale.set(width, height, 1);
      entry.mesh.visible = true;

      entry.uniforms.u_opacity.value = cardOpacity(progress, reducedMotion);
      entry.uniforms.u_aspect.value = width / height;
      entry.uniforms.u_highlight.value = hover.highlight;
    }

    for (let i = wanted; i < this.pool.length; i++) {
      const entry = this.pool[i];
      if (entry) {
        entry.mesh.visible = false;
        entry.assignedKey = null;
      }
    }
  }

  dispose(): void {
    for (const entry of this.pool) {
      entry.mesh.geometry.dispose();
      entry.material.dispose();
    }
    this.pool.length = 0;
    this.textureJobs.clear();
    this.textures.clear();
  }
}
