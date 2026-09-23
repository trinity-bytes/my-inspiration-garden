import * as THREE from "three";
import { DEFAULT_BARREL_K } from "./distortion";
import type { CloudLayerRuntimeConfig } from "./layers/clouds";
import { CloudLayer } from "./layers/clouds";
import { HazeLayer } from "./layers/haze";
import { SkyLayer } from "./layers/sky";
import { NavigationController } from "./navigation-controller";
import { BarrelPass } from "./post/barrel";
import { detectAvifSupport, selectTextureFormat, textureUrl } from "./texture-format";
import type { Vec2 } from "./types";

export interface CanvasEngineOptions {
  /** Fired once texture assets are loaded AND the first frame is drawn (or immediately, on the WebGL-unavailable fallback path). */
  onReady?: () => void;
  /** Fired on a recoverable problem (texture load failure, lost WebGL context, no WebGL). Never thrown. */
  onError?: (error: unknown) => void;
  reducedMotion?: boolean;
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
const CLOUD_FAR_PARALLAX = 0.35;
const CLOUD_NEAR_PARALLAX = 0.65;

// Opacity ranges per parent visual QA (2026-09-23): the original 0.25-0.45 /
// 0.55-0.85 barely read against the sky, worsened by the color-pipeline bug
// above. Sizes reduced again per owner feedback (2026-09-23, round 2): big
// clouds read as blurry from magnification past the source texture's own
// resolution — see max-sprite-size.ts, applied per-sprite in clouds.ts.
const FAR_CLOUD_CONFIG: CloudLayerRuntimeConfig = {
  layerId: 0,
  cellSize: 620,
  density: 0.32,
  scaleMin: 0.7,
  scaleMax: 1.0,
  opacityMin: 0.45,
  opacityMax: 0.6,
  parallax: CLOUD_FAR_PARALLAX,
  marginCells: 1,
  maxPoolSize: 40,
  zDepth: 5,
  baseSpriteSizePx: 380,
};

const NEAR_CLOUD_CONFIG: CloudLayerRuntimeConfig = {
  layerId: 1,
  cellSize: 480,
  density: 0.26,
  scaleMin: 0.8,
  scaleMax: 1.2,
  opacityMin: 0.8,
  opacityMax: 0.95,
  parallax: CLOUD_NEAR_PARALLAX,
  marginCells: 1,
  maxPoolSize: 40,
  zDepth: 4,
  baseSpriteSizePx: 520,
};

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
  private cloudsNear: CloudLayer | null = null;
  private boundTextures: THREE.Texture[] = [];

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
    this.cloudsNear?.dispose();
    this.barrelPass?.dispose();
    this.sky = null;
    this.haze = null;
    this.cloudsFar = null;
    this.cloudsNear = null;
    this.barrelPass = null;

    for (const texture of this.boundTextures) {
      texture.dispose();
    }
    this.boundTextures = [];

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
      this.cloudsNear = new CloudLayer([cloud1, cloud2, cloud3, cloud4], NEAR_CLOUD_CONFIG);

      this.scene.add(this.sky.mesh, this.haze.mesh, this.cloudsFar.group, this.cloudsNear.group);

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

  private fireReady(): void {
    if (this.readyFired) {
      return;
    }
    this.readyFired = true;
    this.options.onReady?.();
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

    // coords.ts: worldToScreen(world, offset, parallax) = world + offset*parallax.
    // A cloud's own cell position is fixed ("world"); the group translation
    // realizes "+offset*parallax" directly (x matches three.js's scene x;
    // y is negated — scene space is y-up, this engine's world convention is
    // y-down, see coords.ts and clouds.ts).
    if (this.cloudsFar) {
      this.cloudsFar.group.position.x = world.x * CLOUD_FAR_PARALLAX;
      this.cloudsFar.group.position.y = -(world.y * CLOUD_FAR_PARALLAX);
      // visibleCellRange needs "which world point is at screen center", i.e.
      // screenToWorld(0, offset, parallax) = -offset*parallax (coords.ts).
      this.cloudsFar.update(
        { x: -world.x * CLOUD_FAR_PARALLAX, y: -world.y * CLOUD_FAR_PARALLAX },
        viewport.width,
        viewport.height,
        this.dpr,
      );
    }
    if (this.cloudsNear) {
      this.cloudsNear.group.position.x = world.x * CLOUD_NEAR_PARALLAX;
      this.cloudsNear.group.position.y = -(world.y * CLOUD_NEAR_PARALLAX);
      this.cloudsNear.update(
        { x: -world.x * CLOUD_NEAR_PARALLAX, y: -world.y * CLOUD_NEAR_PARALLAX },
        viewport.width,
        viewport.height,
        this.dpr,
      );
    }

    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.worldCamera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);

    if (this.texturesLoaded) {
      this.fireReady();
    }
  };
}
