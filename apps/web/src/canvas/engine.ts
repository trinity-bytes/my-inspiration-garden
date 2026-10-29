import type { Item } from "@garden/shared";
import * as THREE from "three";
import { resolveApiBaseUrl } from "../api/client";
import { canvasBackgroundRgb01 } from "./background";
import { visibleHoverKey } from "./card-hover";
import { columnLayoutFor } from "./column-layout";
import { DEFAULT_BARREL_K } from "./distortion";
import { selectDomMirrorCards } from "./dom-mirror";
import { hitTestCard } from "./hit-test";
import {
  type CardInstance,
  DEFAULT_CARD_MARGIN_PX,
  DEFAULT_MAX_CARD_POOL_SIZE,
  type ItemPeriod,
  visibleCardInstances,
} from "./item-layout";
import { CardLayer } from "./layers/cards";
import { LruCache } from "./lru-cache";
import { NavigationController } from "./navigation-controller";
import { PointerInteractionController } from "./pointer-interaction";
import { BarrelPass } from "./post/barrel";
import { renderPixelRatio } from "./render-pixel-ratio";
import type { Vec2 } from "./types";

export interface CanvasEngineOptions {
  /** Fired once the first frame is drawn (or immediately, on the WebGL-unavailable fallback path). */
  onReady?: () => void;
  /** Fired on a recoverable problem (texture load failure, lost WebGL context, no WebGL). Never thrown. */
  onError?: (error: unknown) => void;
  reducedMotion?: boolean;
  /** Items rendered as cards (see `item-layout.ts`); can also be set/updated later via `setItems`. */
  items?: Item[];
  /** Fired when a card is clicked (not after a drag — see `click-vs-drag.ts`) or opened via the parallel DOM/ARIA layer's Enter key. */
  onItemOpen?: (itemId: string) => void;
  /** Fired whenever the set of cards the parallel DOM/ARIA layer should mirror changes (see `dom-mirror.ts`). */
  onVisibleCardsChange?: (cards: CardInstance[]) => void;
}

export interface WorldState {
  worldOffset: Vec2;
  viewportWidth: number;
  viewportHeight: number;
  distortionK: number;
}

// Cards render above everything else in the scene (nothing else is drawn but
// the solid clear color today; the headroom keeps room for future layers).
const CARD_RENDER_ORDER = 200;
const CARD_TEXTURE_CACHE_SIZE = 120;
// A CardInstance's content is a pure, deterministic function of its cell
// (see item-layout.ts) and never changes while `items` doesn't, so caching
// it keeps the per-frame hot path from reallocating an instance (+ its
// nested worldRect) for every visible cell every frame — only cells newly
// entering the render margin allocate. Sized comfortably above the card
// pool cap so cells stay cached through small pans, not just exactly the
// currently-visible set.
const CARD_INSTANCE_CACHE_SIZE = DEFAULT_MAX_CARD_POOL_SIZE * 3;

/**
 * Owns the full WebGL scene: the card layer on a solid background and the
 * barrel-distortion post-process, driven by a `NavigationController`. `mount`/`dispose` are idempotent and safe to call
 * from React effect mount/cleanup, including under StrictMode's double
 * invocation (each invocation should use its own `CanvasEngine` instance).
 *
 * If WebGL is unavailable, `mount` catches the failure, leaves the
 * existing CSS background (see `CanvasHost.css`) alone, and still calls
 * `onReady` so the loading screen clears.
 */
export class CanvasEngine {
  private readonly options: CanvasEngineOptions;
  private reducedMotion: boolean;

  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;

  private scene: THREE.Scene | null = null;
  private worldCamera: THREE.OrthographicCamera | null = null;
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private postScene: THREE.Scene | null = null;
  private postCamera: THREE.OrthographicCamera | null = null;
  private barrelPass: BarrelPass | null = null;

  private cards: CardLayer | null = null;

  private items: Item[];
  /** The full visible-card set computed last frame (hit-testing/hover use this; the DOM mirror uses a smaller, sorted subset — see `dom-mirror.ts`). Reused in place every frame (`visibleCardInstances`'s `out` param) rather than reassigned, so the array itself isn't reallocated either. */
  private readonly lastCardInstances: CardInstance[] = [];
  /** Memoizes `CardInstance`s by cell key across frames — see `CARD_INSTANCE_CACHE_SIZE`. */
  private readonly cardInstanceCache = new LruCache<CardInstance>(
    CARD_INSTANCE_CACHE_SIZE,
    () => {},
  );
  /** Memoizes `columnPeriod` results by `(columnIndex, columnWidth, itemCount)` (T9 carried follow-up) — cleared alongside `cardInstanceCache` (same invalidation triggers: `setItems`, and a resize that changes `columnWidth`), since a period is only valid for the items/column-width it was computed from. */
  private readonly columnPeriodCache = new LruCache<ItemPeriod>(CARD_INSTANCE_CACHE_SIZE, () => {});
  private lastDomMirrorSignature = "";
  /** The column width `visibleCardInstances` was last called with — a resize changes it, which invalidates every cached `CardInstance` (their `worldRect.width`/`x` are only valid for the column width they were computed with). */
  private lastColumnWidth = -1;
  private lastGutter = -1;
  private hoveredCardKey: string | null = null;
  /** The hover key actually rendered last frame (`visibleHoverKey`: `hoveredCardKey`, hidden while panning fast) — the canvas cursor follows it. */
  private renderedHoverKey: string | null = null;
  /** Click-vs-drag / hover / pointer-capture-safe click wiring (see `pointer-interaction.ts`). */
  private pointerInteraction: PointerInteractionController | null = null;

  private navigation: NavigationController | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private rafHandle: number | null = null;
  private lastFrameTime: number | null = null;
  private readonly distortionK = DEFAULT_BARREL_K;

  private disposed = false;
  private readyFired = false;

  constructor(options: CanvasEngineOptions = {}) {
    this.options = options;
    this.reducedMotion = options.reducedMotion ?? false;
    this.items = options.items ?? [];
  }

  /** Updates the items rendered as cards; picked up on the next frame. Invalidates the per-cell instance cache (`cardInstanceCache`), since a cell's cached `CardInstance` is only valid for the items array it was computed from. */
  setItems(items: Item[]): void {
    this.items = items;
    this.cardInstanceCache.clear();
    this.columnPeriodCache.clear();
  }

  /** Pans instantly so the card identified by `key` (see `CardInstance.key` / `dom-mirror.ts`) is centered on screen. A no-op if that card is not among the currently-known instances. */
  centerOnCardKey(key: string): void {
    const instance = this.lastCardInstances.find((candidate) => candidate.key === key);
    if (instance) {
      this.navigation?.centerOn({ x: instance.worldRect.x, y: instance.worldRect.y });
    }
  }

  mount(container: HTMLElement): void {
    if (this.container || this.disposed) {
      return;
    }
    this.container = container;

    let canvas: HTMLCanvasElement;
    let renderer: THREE.WebGLRenderer;
    try {
      canvas = document.createElement("canvas");
      renderer = new THREE.WebGLRenderer({
        canvas,
        // No MSAA: the scene renders into a non-multisampled render target, so the default
        // framebuffer only ever holds the fullscreen barrel quad and a multisample resolve of it
        // would cost a full-screen pass per frame for no visible gain.
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch (error) {
      this.options.onError?.(error);
      this.fireReady();
      return;
    }

    this.canvas = canvas;
    this.renderer = renderer;
    // SRGBColorSpace is the only valid renderer.outputColorSpace (NoColorSpace
    // throws inside three.js's internal drawing-buffer lookup — confirmed via
    // a headless-chromium repro, see the T8a QA-correction commit). It is
    // also a harmless default: a canvas's drawing buffer is sRGB either way,
    // and this setting only matters to three.js's built-in materials'
    // `<colorspace_fragment>` chunk, which our custom ShaderMaterials never
    // include. The actual color-pipeline fix is on the INPUT side: every
    // texture below stays NoColorSpace (raw sRGB-encoded bytes, no hardware
    // decode-on-sample) so texture2D() reads match the source image bytes.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // The solid background. Raw channels (LinearSRGBColorSpace = no
    // conversion): the scene renders into a NoColorSpace target and the
    // shaders pass sRGB-encoded bytes straight through, so the clear color
    // must be those same bytes (see the comment above).
    const [bgR, bgG, bgB] = canvasBackgroundRgb01();
    renderer.setClearColor(new THREE.Color().setRGB(bgR, bgG, bgB, THREE.LinearSRGBColorSpace), 1);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.worldCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.worldCamera.position.z = 100;

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Cards load their own textures independently (layers/cards.ts).
    this.cards = new CardLayer({
      maxPoolSize: DEFAULT_MAX_CARD_POOL_SIZE,
      textureCacheSize: CARD_TEXTURE_CACHE_SIZE,
      apiBaseUrl: resolveApiBaseUrl(),
      renderOrder: CARD_RENDER_ORDER,
    });
    this.scene.add(this.cards.group);

    // Pointer up/cancel/lostpointercapture are listened for on `window`, not `canvas` — see
    // `pointer-interaction.ts`'s `releaseTarget` doc for why: `NavigationController` below
    // captures the pointer on `container` (an ancestor of `canvas`) for its own drag panning,
    // and that capture always wins over one `canvas` would take, retargeting later pointer
    // events away from it.
    this.pointerInteraction = new PointerInteractionController({
      canvas,
      pointerFromEvent: (event) => this.pointerFromEvent(event),
      hitTestAt: (pos) => this.hitTestAt(pos),
      onHoverChange: (key) => this.setHoveredCardKey(key),
      onItemOpen: (cardKey) => {
        const instance = this.lastCardInstances.find((candidate) => candidate.key === cardKey);
        if (instance) {
          this.options.onItemOpen?.(instance.item.id);
        }
      },
    });
    this.pointerInteraction.mount();

    this.navigation = new NavigationController({
      container,
      getViewportSize: () => this.getViewportSize(),
      reducedMotion: this.reducedMotion,
    });
    this.navigation.mount();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.handleResize();

    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    this.rafHandle = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }

    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.navigation?.dispose();
    this.navigation = null;

    this.pointerInteraction?.dispose();
    this.pointerInteraction = null;

    this.cards?.dispose();
    this.barrelPass?.dispose();
    this.cards = null;
    this.barrelPass = null;

    this.renderTarget?.dispose();
    this.renderTarget = null;

    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
      this.canvas.parentElement?.removeChild(this.canvas);
    }
    this.canvas = null;

    this.renderer?.dispose();
    this.renderer = null;

    this.scene = null;
    this.worldCamera = null;
    this.postScene = null;
    this.postCamera = null;
    this.container = null;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.navigation?.setReducedMotion(reduced);
  }

  /** Pauses (or resumes) canvas navigation (T9: the item detail modal). */
  setPaused(paused: boolean): void {
    this.navigation?.setPaused(paused);
  }

  /** Minimal read-only state T8b needs: world offset, viewport size, distortion params. */
  getWorldState(): WorldState {
    const viewport = this.getViewportSize();
    return {
      worldOffset: this.navigation?.getWorldOffset() ?? { x: 0, y: 0 },
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      distortionK: this.distortionK,
    };
  }

  private getViewportSize(): { width: number; height: number } {
    if (!this.container) {
      return { width: 0, height: 0 };
    }
    const rect = this.container.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  private handleResize(): void {
    if (!this.container || !this.renderer || !this.worldCamera) {
      return;
    }
    const { width: rawWidth, height: rawHeight } = this.getViewportSize();
    const width = Math.max(1, Math.round(rawWidth));
    const height = Math.max(1, Math.round(rawHeight));
    const dpr = renderPixelRatio(window.devicePixelRatio, width, height);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);

    this.worldCamera.left = -width / 2;
    this.worldCamera.right = width / 2;
    this.worldCamera.top = height / 2;
    this.worldCamera.bottom = -height / 2;
    this.worldCamera.updateProjectionMatrix();

    const rtWidth = Math.max(1, Math.round(width * dpr));
    const rtHeight = Math.max(1, Math.round(height * dpr));
    if (!this.renderTarget) {
      // No colorSpace option (defaults to NoColorSpace): the barrel pass
      // samples this render target with a raw texture2D(), so an
      // SRGBColorSpace render target here would ask the GPU to sRGB-encode
      // on write and decode on read — an extra, unwanted transform on top
      // of the NoColorSpace pipeline described in mount().
      this.renderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight);
      if (this.postScene) {
        this.barrelPass = new BarrelPass(this.renderTarget.texture, this.distortionK);
        this.postScene.add(this.barrelPass.mesh);
      }
    } else {
      this.renderTarget.setSize(rtWidth, rtHeight);
    }
    this.barrelPass?.setViewport({ width, height });
  }

  private readonly handleVisibilityChange = (): void => {
    if (!document.hidden) {
      // Drop the stale timestamp so the next visible frame doesn't report
      // a huge dt; NavigationController also clamps dt defensively.
      this.lastFrameTime = null;
    }
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.options.onError?.(new Error("WebGL context lost"));
  };

  /** Container-relative pointer position (CSS px, origin top-left) — the convention `hit-test.ts` expects. */
  private pointerFromEvent(event: PointerEvent): Vec2 {
    const rect = this.canvas?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** Cards, keyed by their layout cell (`CardInstance.key`), for `hit-test.ts` — matches what `layers/cards.ts` renders this frame. */
  private hitTestableCards(): { id: string; worldRect: CardInstance["worldRect"] }[] {
    return this.lastCardInstances.map((instance) => ({
      id: instance.key,
      worldRect: instance.worldRect,
    }));
  }

  private hitTestAt(pointer: Vec2): string | null {
    const world = this.navigation?.getWorldOffset() ?? { x: 0, y: 0 };
    const viewport = this.getViewportSize();
    return hitTestCard(pointer, viewport, world, this.distortionK, this.hitTestableCards());
  }

  private setHoveredCardKey(key: string | null): void {
    if (key === this.hoveredCardKey) {
      return;
    }
    this.hoveredCardKey = key;
  }

  private fireReady(): void {
    if (this.readyFired) {
      return;
    }
    this.readyFired = true;
    this.options.onReady?.();
  }

  /**
   * Cards use parallax 1 (they pan 1:1 with navigation):
   * `group.position = world` with fixed local card positions. Recomputes the visible-card set
   * every frame from the current `this.items` (`item-layout.ts`'s `visibleCardInstances`, pure
   * and cheap — no per-frame allocation beyond the returned array itself)
   * and notifies `onVisibleCardsChange` only when the DOM-mirrored subset actually
   * changes (`dom-mirror.ts`), so React doesn't re-render every frame.
   */
  private updateCards(world: Vec2, viewport: { width: number; height: number }): void {
    if (!this.cards) {
      return;
    }

    const { columnWidth, gutter } = columnLayoutFor(viewport.width);
    if (columnWidth !== this.lastColumnWidth || gutter !== this.lastGutter) {
      // A resize changes column geometry, so every previously cached
      // CardInstance's worldRect (computed for the OLD column width) is
      // stale — clear rather than let it silently keep rendering at the
      // wrong size/position until it scrolls out of the render margin.
      this.lastColumnWidth = columnWidth;
      this.lastGutter = gutter;
      this.cardInstanceCache.clear();
      // Not strictly necessary for correctness (columnPeriodCache's key
      // already includes columnWidth, so a stale-width entry is simply
      // never hit again), but clears out entries for the old width that
      // would otherwise sit in the cache until evicted by size pressure.
      this.columnPeriodCache.clear();
    }

    const cardCenterWorld: Vec2 = { x: -world.x, y: -world.y };
    visibleCardInstances(
      this.items,
      cardCenterWorld,
      viewport.width,
      viewport.height,
      columnWidth,
      DEFAULT_CARD_MARGIN_PX,
      DEFAULT_MAX_CARD_POOL_SIZE,
      this.cardInstanceCache,
      this.lastCardInstances,
      this.columnPeriodCache,
      gutter,
    );

    this.cards.group.position.x = world.x;
    this.cards.group.position.y = -world.y;
    const hoverKey = visibleHoverKey(
      this.hoveredCardKey,
      this.navigation?.getVelocity() ?? { x: 0, y: 0 },
    );
    if (hoverKey !== this.renderedHoverKey) {
      this.renderedHoverKey = hoverKey;
      if (this.canvas) {
        this.canvas.style.cursor = hoverKey ? "pointer" : "";
      }
    }
    this.cards.update(
      this.lastCardInstances,
      world,
      viewport.width,
      viewport.height,
      this.reducedMotion,
      hoverKey,
    );

    const domCards = selectDomMirrorCards(this.lastCardInstances);
    const signature = domCards.map((card) => card.key).join("|");
    if (signature !== this.lastDomMirrorSignature) {
      this.lastDomMirrorSignature = signature;
      this.options.onVisibleCardsChange?.(domCards);
    }
  }

  private readonly tick = (now: number): void => {
    if (this.disposed) {
      return;
    }
    this.rafHandle = requestAnimationFrame(this.tick);

    if (document.hidden) {
      this.lastFrameTime = null;
      return;
    }

    const nowSeconds = now / 1000;
    const dt = this.lastFrameTime === null ? 0 : nowSeconds - this.lastFrameTime;
    this.lastFrameTime = nowSeconds;

    this.navigation?.update(dt);

    if (
      !this.renderer ||
      !this.scene ||
      !this.worldCamera ||
      !this.renderTarget ||
      !this.postScene ||
      !this.postCamera
    ) {
      return;
    }

    const world = this.navigation?.getWorldOffset() ?? { x: 0, y: 0 };
    const viewport = this.getViewportSize();

    this.updateCards(world, viewport);

    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.worldCamera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);

    this.fireReady();
  };
}
