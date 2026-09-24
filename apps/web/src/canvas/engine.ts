import type { Item } from "@garden/shared";
import * as THREE from "three";
import { resolveApiBaseUrl } from "../api/client";
import { cloudDepthStyle, cloudOpacityRange } from "./cloud-depth";
import { DEFAULT_BARREL_K } from "./distortion";
import { selectDomMirrorCards } from "./dom-mirror";
import { hitTestCard } from "./hit-test";
import {
  type CardInstance,
  DEFAULT_CARD_MARGIN_CELLS,
  DEFAULT_MAX_CARD_POOL_SIZE,
  visibleCardInstances,
} from "./item-layout";
import { CardLayer } from "./layers/cards";
import type { CloudLayerRuntimeConfig } from "./layers/clouds";
import { CloudLayer } from "./layers/clouds";
import { HazeLayer } from "./layers/haze";
import { SkyLayer } from "./layers/sky";
import { LruCache } from "./lru-cache";
import { NavigationController } from "./navigation-controller";
import {
  IDLE_POINTER_GESTURE,
  isPointerGesturePressed,
  type PointerGestureState,
  pointerGestureDown,
  pointerGestureReset,
  pointerGestureUp,
} from "./pointer-gesture";
import { BarrelPass } from "./post/barrel";
import { detectAvifSupport, selectTextureFormat, textureUrl } from "./texture-format";
import type { Vec2 } from "./types";

export interface CanvasEngineOptions {
  /** Fired once texture assets are loaded AND the first frame is drawn (or immediately, on the WebGL-unavailable fallback path). */
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

const DPR_CAP = 2;

// Parallax factors: how much each layer moves relative to the navigation
// world offset. Smaller = more distant/slower.
const SKY_PARALLAX = 0.05;
const HAZE_PARALLAX = 0.12;

// Aerial perspective (owner feedback, T8a): three cloud depths (far/mid/
// near) built from cloudDepthStyle so speed, opacity, atmospheric tint,
// size and draw order all come from the SAME depth value — a nearer,
// faster layer is always more solid, less tinted, larger, and drawn over
// a farther, slower, hazier one. cellSize/density/scaleMin/scaleMax/
// baseSpriteSizePx stay hand-tuned per layer (not depth-derived) to keep
// ~3-5 clouds visible at 1440x900 without clutter.
const CLOUD_DEPTH_FAR = 0;
const CLOUD_DEPTH_MID = 0.5;
const CLOUD_DEPTH_NEAR = 1;
const CLOUD_BASE_SPRITE_SIZE_PX = 480;

// Cards draw above every cloud layer (decision recorded in
// odd/tasks/garden-mvp.md: "cards above clouds ... near layer still behind
// cards"). Cloud renderOrder tops out at 100 (cloudDepthStyle's
// RENDER_ORDER_SCALE), so 200 leaves headroom.
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

function cloudLayerConfig(
  layerId: number,
  depth: number,
  cellSize: number,
  density: number,
): CloudLayerRuntimeConfig {
  const style = cloudDepthStyle(depth);
  const opacityRange = cloudOpacityRange(depth);
  return {
    layerId,
    cellSize,
    density,
    scaleMin: 0.85,
    scaleMax: 1.15,
    opacityMin: opacityRange.min,
    opacityMax: opacityRange.max,
    parallax: style.parallax,
    marginCells: 1,
    maxPoolSize: 40,
    zDepth: 7 - depth * 2,
    baseSpriteSizePx: CLOUD_BASE_SPRITE_SIZE_PX,
    sizeScale: style.sizeScale,
    atmosphereMix: style.atmosphereMix,
    renderOrder: style.renderOrder,
  };
}

// Exported so cloud-visibility.test.ts can verify actual on-screen
// placement against the exact constants the engine renders with (no
// risk of the test's copy silently drifting from production).
//
// cellSize bug (T8a): 800/650/520 were each comparable to or larger than
// the 900px viewport height, so a cell's own footprint almost always
// straddled a screen edge — no cell was ever geometrically guaranteed to
// land on screen, and the density-selected cells' random offsets landed
// off-screen far more often than on. Densities are unchanged; cellSize
// reduced so most cells are meaningfully smaller than the viewport.
export const FAR_CLOUD_CONFIG = cloudLayerConfig(0, CLOUD_DEPTH_FAR, 550, 0.24);
export const MID_CLOUD_CONFIG = cloudLayerConfig(1, CLOUD_DEPTH_MID, 450, 0.2);
export const NEAR_CLOUD_CONFIG = cloudLayerConfig(2, CLOUD_DEPTH_NEAR, 450, 0.17);

/**
 * Owns the full WebGL scene: sky, procedural haze, two cloud parallax
 * layers and the barrel-distortion post-process, driven by a
 * `NavigationController`. `mount`/`dispose` are idempotent and safe to call
 * from React effect mount/cleanup, including under StrictMode's double
 * invocation (each invocation should use its own `CanvasEngine` instance).
 *
 * If WebGL is unavailable, `mount` catches the failure, leaves the
 * existing CSS sky fallback (see `CanvasHost.css`) alone, and still calls
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

  private sky: SkyLayer | null = null;
  private haze: HazeLayer | null = null;
  private cloudsFar: CloudLayer | null = null;
  private cloudsMid: CloudLayer | null = null;
  private cloudsNear: CloudLayer | null = null;
  private cards: CardLayer | null = null;
  private boundTextures: THREE.Texture[] = [];

  private items: Item[];
  /** The full visible-card set computed last frame (hit-testing/hover use this; the DOM mirror uses a smaller, sorted subset — see `dom-mirror.ts`). Reused in place every frame (`visibleCardInstances`'s `out` param) rather than reassigned, so the array itself isn't reallocated either. */
  private readonly lastCardInstances: CardInstance[] = [];
  /** Memoizes `CardInstance`s by cell key across frames — see `CARD_INSTANCE_CACHE_SIZE`. */
  private readonly cardInstanceCache = new LruCache<CardInstance>(
    CARD_INSTANCE_CACHE_SIZE,
    () => {},
  );
  private lastDomMirrorSignature = "";
  private hoveredCardKey: string | null = null;
  /** Click-vs-drag / hover-suppression state machine (see `pointer-gesture.ts`). */
  private pointerGesture: PointerGestureState = IDLE_POINTER_GESTURE;

  private navigation: NavigationController | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private rafHandle: number | null = null;
  private lastFrameTime: number | null = null;
  private elapsedTime = 0;
  private readonly distortionK = DEFAULT_BARREL_K;
  private dpr = 1;

  private disposed = false;
  private readyFired = false;
  private texturesLoaded = false;

  constructor(options: CanvasEngineOptions = {}) {
    this.options = options;
    this.reducedMotion = options.reducedMotion ?? false;
    this.items = options.items ?? [];
  }

  /** Updates the items rendered as cards; picked up on the next frame. Invalidates the per-cell instance cache (`cardInstanceCache`), since a cell's cached `CardInstance` is only valid for the items array it was computed from. */
  setItems(items: Item[]): void {
    this.items = items;
    this.cardInstanceCache.clear();
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
        antialias: true,
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
    renderer.setClearColor(0x000000, 1);
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

    // Cards don't wait on the sky/cloud texture load (loadAssetsAndBuildScene,
    // below): they load their own textures independently (layers/cards.ts).
    this.cards = new CardLayer({
      maxPoolSize: DEFAULT_MAX_CARD_POOL_SIZE,
      textureCacheSize: CARD_TEXTURE_CACHE_SIZE,
      apiBaseUrl: resolveApiBaseUrl(),
      renderOrder: CARD_RENDER_ORDER,
    });
    this.scene.add(this.cards.group);

    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerCancel);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    canvas.addEventListener("lostpointercapture", this.handleLostPointerCapture);

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

    void this.loadAssetsAndBuildScene();

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

    this.sky?.dispose();
    this.haze?.dispose();
    this.cloudsFar?.dispose();
    this.cloudsMid?.dispose();
    this.cloudsNear?.dispose();
    this.cards?.dispose();
    this.barrelPass?.dispose();
    this.sky = null;
    this.haze = null;
    this.cloudsFar = null;
    this.cloudsMid = null;
    this.cloudsNear = null;
    this.cards = null;
    this.barrelPass = null;

    for (const texture of this.boundTextures) {
      texture.dispose();
    }
    this.boundTextures = [];

    this.renderTarget?.dispose();
    this.renderTarget = null;

    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
      this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
      this.canvas.removeEventListener("lostpointercapture", this.handleLostPointerCapture);
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

  private async loadAssetsAndBuildScene(): Promise<void> {
    try {
      const avifSupported = await detectAvifSupport();
      const format = selectTextureFormat(avifSupported);
      const loader = new THREE.TextureLoader();
      const loadTexture = (basePath: string) =>
        new Promise<THREE.Texture>((resolve, reject) => {
          loader.load(textureUrl(basePath, format), resolve, undefined, reject);
        });

      const [skyTexture, cloud1, cloud2, cloud3, cloud4] = await Promise.all([
        loadTexture("/images/sky"),
        loadTexture("/images/cloud-1"),
        loadTexture("/images/cloud-2"),
        loadTexture("/images/cloud-3"),
        loadTexture("/images/cloud-4"),
      ]);

      if (this.disposed || !this.scene) {
        for (const texture of [skyTexture, cloud1, cloud2, cloud3, cloud4]) {
          texture.dispose();
        }
        return;
      }

      // NoColorSpace (default) throughout — see the renderer.outputColorSpace
      // comment in mount(). The cloud sprite shader also composites in raw
      // sRGB-encoded byte space, so no per-texture conversion here either.
      this.boundTextures = [skyTexture, cloud1, cloud2, cloud3, cloud4];

      this.sky = new SkyLayer({ texture: skyTexture, parallax: SKY_PARALLAX });
      this.haze = new HazeLayer({ parallax: HAZE_PARALLAX });
      this.cloudsFar = new CloudLayer([cloud1, cloud2, cloud3, cloud4], FAR_CLOUD_CONFIG);
      this.cloudsMid = new CloudLayer([cloud1, cloud2, cloud3, cloud4], MID_CLOUD_CONFIG);
      this.cloudsNear = new CloudLayer([cloud1, cloud2, cloud3, cloud4], NEAR_CLOUD_CONFIG);

      // Draw order far -> mid -> near also matches insertion order here;
      // renderOrder (set per layer from cloud-depth.ts) is what actually
      // guarantees it regardless of insertion or z position.
      this.scene.add(
        this.sky.mesh,
        this.haze.mesh,
        this.cloudsFar.group,
        this.cloudsMid.group,
        this.cloudsNear.group,
      );

      this.texturesLoaded = true;
    } catch (error) {
      this.options.onError?.(error);
      // Assets failed; keep whatever rendered so far (or the CSS fallback)
      // and still resolve readiness so the loading screen does not hang.
      this.texturesLoaded = true;
      this.fireReady();
    }
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
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    this.dpr = dpr;

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
    this.barrelPass?.setAspect(width / Math.max(height, 1));
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
    if (this.canvas) {
      this.canvas.style.cursor = key ? "pointer" : "";
    }
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerGesture = pointerGestureDown(this.pointerFromEvent(event));
    // Pointer Capture keeps pointerup/pointercancel/lostpointercapture
    // targeting this canvas even if the button is released outside it (a
    // fast drag off-screen, for example) — without it, a release-outside
    // never fires pointerup here, leaving the gesture stuck "pressed" and
    // hover feedback permanently suppressed until the next full
    // down/up cycle. Feature-detected: jsdom (this project's test
    // environment) doesn't implement it, and some pointer types can
    // legitimately reject capture.
    if (typeof this.canvas?.setPointerCapture === "function") {
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // Falls back to ordinary event targeting — still correct, just
        // less robust against release-outside-canvas.
      }
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    // A held button means the user is panning (NavigationController's own
    // drag handling) or about to click — hover feedback would just be
    // noisy mid-gesture.
    if (isPointerGesturePressed(this.pointerGesture)) {
      return;
    }
    this.setHoveredCardKey(this.hitTestAt(this.pointerFromEvent(event)));
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const pos = this.pointerFromEvent(event);
    const { state, isClick: wasClick } = pointerGestureUp(this.pointerGesture, pos);
    this.pointerGesture = state;
    if (!wasClick) {
      return;
    }
    const hitKey = this.hitTestAt(pos);
    if (!hitKey) {
      return;
    }
    const instance = this.lastCardInstances.find((candidate) => candidate.key === hitKey);
    if (instance) {
      this.options.onItemOpen?.(instance.item.id);
    }
  };

  private readonly handlePointerCancel = (): void => {
    this.pointerGesture = pointerGestureReset();
  };

  private readonly handlePointerLeave = (): void => {
    this.setHoveredCardKey(null);
  };

  /** Fires if capture is released without a prior pointerup/pointercancel (some browsers force-release it, e.g. on multi-touch conflicts) — a safety net so the gesture never stays stuck "pressed". */
  private readonly handleLostPointerCapture = (): void => {
    this.pointerGesture = pointerGestureReset();
  };

  private fireReady(): void {
    if (this.readyFired) {
      return;
    }
    this.readyFired = true;
    this.options.onReady?.();
  }

  /**
   * coords.ts: worldToScreen(world, offset, parallax) = world + offset*parallax.
   * A cloud's own cell position is fixed ("world"); the group translation
   * realizes "+offset*parallax" directly (x matches three.js's scene x; y
   * is negated — scene space is y-up, this engine's world convention is
   * y-down, see coords.ts and clouds.ts). visibleCellRange (inside
   * `update`) needs "which world point is at screen center", i.e.
   * screenToWorld(0, offset, parallax) = -offset*parallax.
   */
  private updateCloudLayer(
    layer: CloudLayer | null,
    parallax: number,
    world: Vec2,
    viewport: { width: number; height: number },
  ): void {
    if (!layer) {
      return;
    }
    layer.group.position.x = world.x * parallax;
    layer.group.position.y = -(world.y * parallax);
    layer.update(
      { x: -world.x * parallax, y: -world.y * parallax },
      viewport.width,
      viewport.height,
      this.dpr,
    );
  }

  /**
   * Cards use parallax 1 (they pan 1:1 with navigation, unlike the ambient
   * sky/cloud layers) — the same `group.position = world * parallax` +
   * fixed-local-position technique as `updateCloudLayer`, with parallax
   * fixed at 1. Recomputes the visible-card set every frame from the
   * current `this.items` (`item-layout.ts`'s `visibleCardInstances`, pure
   * and cheap — no per-frame allocation beyond the returned array itself,
   * matching the cloud layers' own per-frame recompute) and notifies
   * `onVisibleCardsChange` only when the DOM-mirrored subset actually
   * changes (`dom-mirror.ts`), so React doesn't re-render every frame.
   */
  private updateCards(world: Vec2, viewport: { width: number; height: number }): void {
    if (!this.cards) {
      return;
    }

    const cardCenterWorld: Vec2 = { x: -world.x, y: -world.y };
    visibleCardInstances(
      this.items,
      cardCenterWorld,
      viewport.width,
      viewport.height,
      DEFAULT_CARD_MARGIN_CELLS,
      DEFAULT_MAX_CARD_POOL_SIZE,
      this.cardInstanceCache,
      this.lastCardInstances,
    );

    this.cards.group.position.x = world.x;
    this.cards.group.position.y = -world.y;
    this.cards.update(
      this.lastCardInstances,
      world,
      viewport.width,
      viewport.height,
      this.dpr,
      this.reducedMotion,
      this.hoveredCardKey,
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

    if (!this.reducedMotion) {
      this.elapsedTime += Math.min(Math.max(dt, 0), 1 / 30);
    }

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

    this.sky?.update(viewport, world, this.elapsedTime);
    this.haze?.update(viewport, world, this.elapsedTime);

    this.updateCloudLayer(this.cloudsFar, FAR_CLOUD_CONFIG.parallax, world, viewport);
    this.updateCloudLayer(this.cloudsMid, MID_CLOUD_CONFIG.parallax, world, viewport);
    this.updateCloudLayer(this.cloudsNear, NEAR_CLOUD_CONFIG.parallax, world, viewport);

    this.updateCards(world, viewport);

    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.worldCamera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);

    if (this.texturesLoaded) {
      this.fireReady();
    }
  };
}
