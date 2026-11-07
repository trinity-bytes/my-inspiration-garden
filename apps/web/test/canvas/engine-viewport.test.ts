import { afterEach, expect, it, vi } from "vitest";
import { CanvasEngine } from "../../src/canvas/engine";

const renderer = vi.hoisted(() => ({
  setSize: vi.fn(),
  setPixelRatio: vi.fn(),
  render: vi.fn(),
}));
vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    setClearColor = vi.fn();
    setSize = renderer.setSize;
    setPixelRatio = renderer.setPixelRatio;
    setRenderTarget = vi.fn();
    render = renderer.render;
    dispose = vi.fn();
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("measures at mount and resize, not during repeated frames or state reads", () => {
  let resize = () => {};
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
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
  const container = document.createElement("div");
  let width = 390.5;
  let height = 844.25;
  const measure = vi.spyOn(container, "getBoundingClientRect").mockImplementation(() => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON() {},
  }));
  document.body.append(container);
  const engine = new CanvasEngine({ reducedMotion: true });
  try {
    engine.mount(container);
    expect(engine.getWorldState()).toMatchObject({ viewportWidth: width, viewportHeight: height });
    for (const now of [0, 16, 32, 48]) {
      frame(now);
      engine.getWorldState();
    }
    expect(measure).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(8);
    width = 410.75;
    height = 900.25;
    resize();
    expect(engine.getWorldState()).toMatchObject({ viewportWidth: width, viewportHeight: height });
    expect(renderer.setSize).toHaveBeenLastCalledWith(411, 900, false);
    expect(measure).toHaveBeenCalledTimes(2);
    frame(64);
    expect(measure).toHaveBeenCalledTimes(2);
    engine.dispose();
    expect(engine.getWorldState()).toMatchObject({ viewportWidth: 0, viewportHeight: 0 });
  } finally {
    engine.dispose();
    container.remove();
  }
});
