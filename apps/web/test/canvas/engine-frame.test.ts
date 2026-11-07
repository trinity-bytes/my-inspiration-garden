import type { Item } from "@garden/shared";
import * as THREE from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_BARREL_K } from "../../src/canvas/distortion";
import { CanvasEngine } from "../../src/canvas/engine";
import { worldToPointer } from "../../src/canvas/hit-test";
import type { CardInstance } from "../../src/canvas/item-layout";
import { makeItem } from "../fixtures/items";

vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    setClearColor = vi.fn();
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    setRenderTarget = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock("../../src/canvas/card-painters", () => ({
  paintItemCardCanvas: vi.fn(async () => document.createElement("canvas")),
  paintPhotoCanvas: vi.fn(async () => document.createElement("canvas")),
}));
vi.mock("../../src/canvas/placeholder-texture", () => ({
  createCardCanvasTexture: () => new THREE.Texture(),
  createPlaceholderTexture: () => new THREE.Texture(),
  deviceTextureSize: (width: number, height: number) => ({ width, height }),
  paintPlaceholderCanvas: () => document.createElement("canvas"),
}));

const VIEWPORT = { left: 10, top: 20, width: 800, height: 600 };

let frame: FrameRequestCallback = () => {};
let now = 0;
function nextFrame(): void {
  now += 16;
  frame(now);
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function photos(revision = "2026-01-01T00:00:00.000Z"): Item[] {
  return ["a", "b", "c", "d", "e", "f"].map((id) =>
    makeItem(id, "image", {}, { title: `Photo ${id} ${revision}`, updatedAt: revision }),
  );
}

/** The card closest to the viewport center (the first instances sit in the off-screen margin). */
function onScreen(cards: readonly CardInstance[]): CardInstance {
  const distance = (card: CardInstance) => Math.hypot(card.worldRect.x, card.worldRect.y);
  return [...cards].sort((a, b) => distance(a) - distance(b))[0] as CardInstance;
}

function mountEngine(options: ConstructorParameters<typeof CanvasEngine>[0]) {
  const container = document.createElement("div");
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    ...VIEWPORT,
    x: VIEWPORT.left,
    y: VIEWPORT.top,
    right: VIEWPORT.left + VIEWPORT.width,
    bottom: VIEWPORT.top + VIEWPORT.height,
    toJSON() {},
  });
  document.body.append(container);
  const engine = new CanvasEngine({ reducedMotion: true, ...options });
  engine.mount(container);
  const canvas = container.querySelector("canvas") as HTMLCanvasElement;
  const internals = engine as unknown as {
    lastCardInstances: CardInstance[];
  };
  return {
    engine,
    canvas,
    internals,
    cleanup: () => {
      engine.dispose();
      container.remove();
    },
  };
}

it("notifies the DOM mirror once per visible-set change, including edits that keep the same cells", () => {
  const onVisibleCardsChange = vi.fn();
  const { engine, cleanup } = mountEngine({ items: photos(), onVisibleCardsChange });
  try {
    for (let i = 0; i < 5; i++) nextFrame();
    expect(onVisibleCardsChange).toHaveBeenCalledTimes(1);
    const first = onVisibleCardsChange.mock.calls[0]?.[0] as CardInstance[];
    expect(first.length).toBeGreaterThan(0);

    const edited = photos("2026-02-01T00:00:00.000Z");
    engine.setItems(edited);
    for (let i = 0; i < 5; i++) nextFrame();
    expect(onVisibleCardsChange).toHaveBeenCalledTimes(2);
    const second = onVisibleCardsChange.mock.calls[1]?.[0] as CardInstance[];
    expect(second.map((card) => card.key)).toEqual(first.map((card) => card.key));
    expect(second.every((card) => edited.includes(card.item))).toBe(true);
  } finally {
    cleanup();
  }
});

it("hit-tests pointer moves against the cached container rect without forcing layout", () => {
  const { canvas, internals, cleanup } = mountEngine({ items: photos() });
  try {
    nextFrame();
    const target = onScreen(internals.lastCardInstances);
    const pointer = worldToPointer(
      { x: target.worldRect.x, y: target.worldRect.y },
      VIEWPORT,
      { x: 0, y: 0 },
      DEFAULT_BARREL_K,
    );
    const measure = vi.spyOn(canvas, "getBoundingClientRect");
    canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: pointer.x + VIEWPORT.left,
        clientY: pointer.y + VIEWPORT.top,
        bubbles: true,
      }),
    );
    nextFrame();
    expect(measure).not.toHaveBeenCalled();
    expect(canvas.style.cursor).toBe("pointer");

    canvas.dispatchEvent(
      new PointerEvent("pointermove", { clientX: -5000, clientY: -5000, bubbles: true }),
    );
    nextFrame();
    expect(canvas.style.cursor).toBe("");
  } finally {
    cleanup();
  }
});
