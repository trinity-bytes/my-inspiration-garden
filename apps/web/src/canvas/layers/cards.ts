import type { Item } from "@garden/shared";
import * as THREE from "three";
import { cardEntryProgress, cardOpacity, cardScreenRect } from "../card-fade";
import { cardHoverStyle } from "../card-hover";
import { paintItemCardCanvas, paintPhotoCanvas } from "../card-painters";
import { isStaleLoadCallback } from "../card-texture-token";
import { type CardInstance, cardAssignmentKey } from "../item-layout";
import {
  createCardCanvasTexture,
  createPlaceholderTexture,
  paintPlaceholderCanvas,
} from "../placeholder-texture";
import { CARD_FRAGMENT_GLSL, CARD_VERTEX_GLSL } from "../shaders/card";
import { skeletonHasLines, stepFade } from "../skeleton";
import { TextureRegistry } from "../texture-registry";
import { thumbnailUrlForItem } from "../thumbnail-source";
import type { Vec2 } from "../types";

export interface CardLayerOptions {
  maxPoolSize: number;
  /** Max distinct textures kept resident; evicted textures are disposed (see `texture-registry.ts`). */
  textureCacheSize: number;
  apiBaseUrl: string;
  renderOrder: number;
}

/** Per-frame inputs shared by every card in a layer. */
export interface CardFrame {
  worldOffset: Vec2;
  viewportWidth: number;
  viewportHeight: number;
  reducedMotion: boolean;
  dtSeconds: number;
  /** The whole layer's opacity: the skeleton and card layers cross-fade when the items land. */
  layerOpacity: number;
  /** See `skeleton.ts`; render-target pixels, the space of `gl_FragCoord`. */
  sheenCenterPx: number;
  sheenHalfWidthPx: number;
}

const CORNER_RADIUS_FRACTION = 0.08;

interface CardUniforms {
  u_videoAspect: { value: number };
  u_map: { value: THREE.Texture | null };
  u_opacity: { value: number };
  u_aspect: { value: number };
  u_cornerRadius: { value: number };
  u_highlight: { value: number };
  u_reveal: { value: number };
  u_lines: { value: number };
  u_sheenCenter: { value: number };
  u_sheenHalfWidth: { value: number };
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
  poster: THREE.Texture | null;
  /** True once `u_map` holds this assignment's texture; until then the card shows its skeleton. */
  textureReady: boolean;
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
  private readonly assignmentKeys: string[] = [];
  private readonly textures: TextureRegistry<THREE.Texture>;

  private playbackKey: string | null = null;
  private playbackTexture: THREE.VideoTexture | null = null;

  setPlayback(key: string | null, texture: THREE.VideoTexture | null): void {
    this.playbackKey = key;
    this.playbackTexture = texture;
    for (const entry of this.pool) {
      entry.uniforms.u_map.value = entry.poster;
      entry.uniforms.u_videoAspect.value = 0;
      if (!entry.textureReady) entry.uniforms.u_reveal.value = 0;
    }
  }

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
        u_videoAspect: { value: 0 },
        u_opacity: { value: 0 },
        u_aspect: { value: 1 },
        u_cornerRadius: { value: CORNER_RADIUS_FRACTION },
        u_highlight: { value: 0 },
        u_reveal: { value: 0 },
        u_lines: { value: 0 },
        u_sheenCenter: { value: 0 },
        u_sheenHalfWidth: { value: 1 },
      };
      const material = new THREE.ShaderMaterial({
        vertexShader: CARD_VERTEX_GLSL,
        fragmentShader: CARD_FRAGMENT_GLSL.replace(
          "uniform sampler2D u_map;",
          "uniform sampler2D u_map;\nuniform float u_videoAspect;",
        ).replace(
          "vec4 tex = texture2D(u_map, vUv);",
          `vec2 mediaUv = vUv;
          if (u_videoAspect > 0.0) {
            vec2 crop = vec2(min(1.0, u_aspect / u_videoAspect), min(1.0, u_videoAspect / u_aspect));
            mediaUv = (vUv - 0.5) * crop + 0.5;
          }
          vec4 tex = texture2D(u_map, mediaUv);`,
        ),
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
        poster: null,
        pinnedTextureKey: null,
        loadToken: 0,
        textureReady: false,
      });
    }
  }

  private applyTexture(entry: PoolEntry, texture: THREE.Texture): void {
    entry.poster = texture;
    entry.uniforms.u_map.value = texture;
    entry.textureReady = true;
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
      (resolve, reject) => {
        if (!thumbnailUrl) {
          resolve(createPlaceholderTexture(item, widthPx, heightPx));
          return;
        }
        paintPhotoCanvas(thumbnailUrl, widthPx, heightPx).then(
          (canvas) => (canvas ? resolve(createCardCanvasTexture(canvas)) : reject()),
          reject,
        );
      },
      (texture) => {
        if (!isStaleLoadCallback(entry.loadToken, token)) {
          this.applyTexture(entry, texture);
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
          (resolveFallback) => resolveFallback(createPlaceholderTexture(item, widthPx, heightPx)),
          (texture) => {
            if (!isStaleLoadCallback(entry.loadToken, token)) {
              this.applyTexture(entry, texture);
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
      (resolve) => {
        paintItemCardCanvas(item, widthPx, heightPx, { apiBaseUrl: this.options.apiBaseUrl })
          .then((canvas) => resolve(createCardCanvasTexture(canvas)))
          .catch(() =>
            resolve(createCardCanvasTexture(paintPlaceholderCanvas(item, widthPx, heightPx))),
          );
      },
      (texture) => {
        if (!isStaleLoadCallback(entry.loadToken, token)) {
          this.applyTexture(entry, texture);
        }
      },
      () => {},
    );
  }

  /** Places `entry` on `instance`'s slot for this frame. */
  private placeEntry(
    entry: PoolEntry,
    instance: CardInstance,
    frame: CardFrame,
    hover: ReturnType<typeof cardHoverStyle>,
  ): void {
    const screenRect = cardScreenRect(instance.worldRect, frame.worldOffset, 1);
    const progress = cardEntryProgress(screenRect, frame.viewportWidth, frame.viewportHeight);
    const width = instance.worldRect.width * hover.scale;
    const height = instance.worldRect.height * hover.scale;

    // Y negated: mesh position is scene space (y-up); worldRect is this
    // engine's y-down world convention (coords.ts), same as every other layer.
    entry.mesh.position.set(instance.worldRect.x, -instance.worldRect.y, 0);
    entry.mesh.scale.set(width, height, 1);
    entry.mesh.visible = true;

    entry.uniforms.u_opacity.value =
      cardOpacity(progress, frame.reducedMotion) * frame.layerOpacity;
    entry.uniforms.u_aspect.value = width / height;
    entry.uniforms.u_highlight.value = hover.highlight;
    entry.uniforms.u_sheenCenter.value = frame.sheenCenterPx;
    entry.uniforms.u_sheenHalfWidth.value = frame.sheenHalfWidthPx;
  }

  /** Keep surviving cells on their meshes; only entering cells acquire a new assignment. */
  private alignPool(keys: readonly string[], wanted: number): void {
    let aligned = true;
    for (let i = 0; i < wanted; i++) {
      if (this.pool[i]?.assignedKey !== (keys[i] as string)) {
        aligned = false;
        break;
      }
    }
    if (aligned) return;

    const wantedKeys = new Set<string>();
    for (let i = 0; i < wanted; i++) wantedKeys.add(keys[i] as string);
    // Invariant: assignment keys are unique per frame. A duplicate would map
    // two slots onto the same retained entry and render one mesh twice.
    if (import.meta.env.DEV && wantedKeys.size !== wanted) {
      throw new Error("CardLayer.alignPool: duplicate assignment keys in one frame");
    }
    const retained = new Map<string, PoolEntry>();
    const free: PoolEntry[] = [];
    for (const entry of this.pool) {
      if (entry.assignedKey !== null && wantedKeys.has(entry.assignedKey)) {
        retained.set(entry.assignedKey, entry);
      } else {
        free.push(entry);
      }
    }
    const ordered: PoolEntry[] = [];
    let nextFree = 0;
    for (let i = 0; i < wanted; i++) {
      const key = keys[i] as string;
      ordered.push(retained.get(key) ?? (free[nextFree++] as PoolEntry));
    }
    this.pool.splice(0, this.pool.length, ...ordered, ...free.slice(nextFree));
  }

  private hideEntriesFrom(start: number): void {
    for (let i = start; i < this.pool.length; i++) {
      const entry = this.pool[i];
      if (entry) {
        entry.mesh.visible = false;
        if (entry.assignedKey !== null) {
          entry.assignedKey = null;
          entry.loadToken++;
          if (entry.pinnedTextureKey !== null) this.textures.unpin(entry.pinnedTextureKey);
          entry.pinnedTextureKey = null;
          entry.poster = null;
          entry.textureReady = false;
          entry.uniforms.u_map.value = null;
          entry.uniforms.u_videoAspect.value = 0;
          entry.uniforms.u_reveal.value = 0;
        }
      }
    }
  }

  /**
   * `instances` is the current visible-card set (`item-layout.ts`'s
   * `visibleCardInstances`, already computed by the caller — this class
   * does not do virtualization math itself). A card always fills its column
   * slot: shrinking it to its texture's resolution broke the even gutter on
   * high-DPR screens, so composed textures are painted at device resolution
   * instead (`placeholder-texture.ts`'s `createDeviceCanvas`). A card whose
   * texture is still loading shows its skeleton and cross-fades when it lands;
   * a cached texture arrives synchronously, so panning never fades.
   */
  update(instances: readonly CardInstance[], frame: CardFrame, hoveredKey: string | null): void {
    const wanted = Math.min(instances.length, this.options.maxPoolSize);
    this.ensurePoolSize(wanted);
    this.assignmentKeys.length = wanted;
    for (let i = 0; i < wanted; i++) {
      this.assignmentKeys[i] = cardAssignmentKey(instances[i] as CardInstance);
    }
    this.alignPool(this.assignmentKeys, wanted);
    // Retire departing cells before new loads can trigger texture eviction.
    this.hideEntriesFrom(wanted);

    for (let i = 0; i < wanted; i++) {
      const instance = instances[i];
      const entry = this.pool[i];
      if (!instance || !entry) {
        continue;
      }

      const assignmentKey = this.assignmentKeys[i] as string;
      if (entry.assignedKey !== assignmentKey) {
        entry.assignedKey = assignmentKey;
        entry.loadToken++;
        entry.textureReady = false;
        entry.poster = null;
        this.assignTexture(
          entry,
          instance.item,
          instance.worldRect.width,
          instance.worldRect.height,
        );
        entry.uniforms.u_reveal.value = entry.textureReady ? 1 : 0;
      }

      entry.uniforms.u_map.value = entry.poster;
      entry.uniforms.u_videoAspect.value = 0;
      let liveReady = false;
      if (instance.key === this.playbackKey && this.playbackTexture) {
        const video = this.playbackTexture.image as HTMLVideoElement;
        if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
          liveReady = true;
          entry.uniforms.u_map.value = this.playbackTexture;
          entry.uniforms.u_videoAspect.value = video.videoWidth / video.videoHeight;
        }
      }
      entry.uniforms.u_reveal.value = stepFade(
        entry.uniforms.u_reveal.value,
        entry.textureReady || liveReady ? 1 : 0,
        frame.dtSeconds,
        frame.reducedMotion,
      );
      this.placeEntry(entry, instance, frame, cardHoverStyle(hoveredKey === instance.key));
    }
  }

  /** Draws `instances` as bare skeletons, with no textures: the placeholders shown while the items load. */
  updateSkeletons(instances: readonly CardInstance[], frame: CardFrame): void {
    const wanted = Math.min(instances.length, this.options.maxPoolSize);
    this.ensurePoolSize(wanted);

    for (let i = 0; i < wanted; i++) {
      const instance = instances[i];
      const entry = this.pool[i];
      if (!instance || !entry) {
        continue;
      }
      entry.uniforms.u_reveal.value = 0;
      entry.uniforms.u_lines.value = skeletonHasLines(instance.item) ? 1 : 0;
      this.placeEntry(entry, instance, frame, cardHoverStyle(false));
    }

    this.hideEntriesFrom(wanted);
  }

  dispose(): void {
    for (const entry of this.pool) {
      entry.mesh.geometry.dispose();
      entry.material.dispose();
    }
    this.pool.length = 0;
    this.assignmentKeys.length = 0;
    this.textures.clear();
  }
}
