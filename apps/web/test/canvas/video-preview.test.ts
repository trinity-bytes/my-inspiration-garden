import { afterEach, describe, expect, it, vi } from "vitest";
import { loadVideoFrame } from "../../src/canvas/video-preview";

afterEach(() => vi.restoreAllMocks());

describe("loadVideoFrame", () => {
  function setup() {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const drawImage = vi.fn();
    vi.spyOn(canvas, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "video"
        ? video
        : tag === "canvas"
          ? canvas
          : create(tag)) as typeof document.createElement);
    vi.spyOn(video, "load").mockImplementation(() => {});
    vi.spyOn(video, "pause").mockImplementation(() => {});
    Object.defineProperties(video, {
      videoWidth: { value: 1920 },
      videoHeight: { value: 1080 },
    });
    return { video, canvas, drawImage };
  }

  it("captures a decoded uploaded video frame and releases the source", async () => {
    const { video, canvas, drawImage } = setup();
    const result = loadVideoFrame("/api/media/clip.mp4", 320, 180);
    expect(video.src).toContain("/api/media/clip.mp4");
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    video.dispatchEvent(new Event("loadeddata"));
    expect(await result).toBe(canvas);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 320, 180);
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.pause).toHaveBeenCalled();
  });

  it("falls back and releases resources on decode failure", async () => {
    const { video, drawImage } = setup();
    const result = loadVideoFrame("/api/media/broken.webm", 320, 180);
    video.dispatchEvent(new Event("error"));
    expect(await result).toBeNull();
    video.dispatchEvent(new Event("loadeddata"));
    expect(drawImage).not.toHaveBeenCalled();
    expect(video.hasAttribute("src")).toBe(false);
  });

  it("bounds the wait for videos that never decode", async () => {
    vi.useFakeTimers();
    try {
      const { video } = setup();
      const result = loadVideoFrame("/api/media/stalled.mp4", 320, 180);
      await vi.advanceTimersByTimeAsync(8000);
      expect(await result).toBeNull();
      expect(video.hasAttribute("src")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back if drawing the decoded frame fails", async () => {
    const { video, drawImage } = setup();
    drawImage.mockImplementation(() => {
      throw new Error("decode failed");
    });
    const result = loadVideoFrame("/api/media/clip.mp4", 320, 180);
    video.dispatchEvent(new Event("loadeddata"));
    expect(await result).toBeNull();
    expect(video.hasAttribute("src")).toBe(false);
  });
});
