import { afterEach, expect, it, vi } from "vitest";
import { VideoPlayback } from "../../src/canvas/video-playback";

afterEach(() => vi.restoreAllMocks());

it("plays only one cell, toggles off and releases its decoder and texture", async () => {
  const video = document.createElement("video");
  vi.spyOn(document, "createElement").mockReturnValue(video);
  vi.spyOn(video, "load").mockImplementation(() => {});
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  const play = vi.spyOn(video, "play").mockResolvedValue();
  const player = new VideoPlayback(vi.fn());
  player.toggle("cell-a", "/clip.mp4");
  const texture = player.texture;
  if (!texture) throw new Error("Expected live texture");
  const dispose = vi.spyOn(texture, "dispose");
  await Promise.resolve();
  expect(play).toHaveBeenCalledOnce();
  expect(player.key).toBe("cell-a");
  player.toggle("cell-a", "/clip.mp4");
  expect(player.key).toBeNull();
  expect(pause).toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
  expect(video.hasAttribute("src")).toBe(false);
});

it("surfaces rejected playback and releases resources", async () => {
  const video = document.createElement("video");
  vi.spyOn(document, "createElement").mockReturnValue(video);
  vi.spyOn(video, "load").mockImplementation(() => {});
  vi.spyOn(video, "pause").mockImplementation(() => {});
  vi.spyOn(video, "play").mockRejectedValue(new Error("unsupported"));
  const state = vi.fn();
  const player = new VideoPlayback(state);
  player.toggle("cell", "/clip.mp4");
  await Promise.resolve();
  expect(player.key).toBeNull();
  expect(state).toHaveBeenLastCalledWith(
    null,
    "Couldn't play this video. Try again or open details.",
  );
});

it("switches repeated cells and ignores stale rejection from the previous decoder", async () => {
  const first = document.createElement("video");
  const second = document.createElement("video");
  vi.spyOn(first, "load").mockImplementation(() => {});
  vi.spyOn(first, "pause").mockImplementation(() => {});
  vi.spyOn(second, "load").mockImplementation(() => {});
  vi.spyOn(second, "pause").mockImplementation(() => {});
  let rejectFirst: (error: Error) => void = () => {};
  vi.spyOn(first, "play").mockReturnValue(
    new Promise((_, reject) => {
      rejectFirst = reject;
    }),
  );
  vi.spyOn(second, "play").mockResolvedValue();
  vi.spyOn(document, "createElement").mockReturnValueOnce(first).mockReturnValueOnce(second);
  const player = new VideoPlayback(vi.fn());
  player.toggle("cell-a", "/same.mp4");
  player.toggle("cell-b", "/same.mp4");
  rejectFirst(new Error("stale"));
  await Promise.resolve();
  expect(player.key).toBe("cell-b");
  expect(first.hasAttribute("src")).toBe(false);
  player.stop();
});

it("bounds stalled playback and returns to the poster", async () => {
  vi.useFakeTimers();
  try {
    const video = document.createElement("video");
    vi.spyOn(document, "createElement").mockReturnValue(video);
    vi.spyOn(video, "load").mockImplementation(() => {});
    vi.spyOn(video, "pause").mockImplementation(() => {});
    vi.spyOn(video, "play").mockReturnValue(new Promise(() => {}));
    const change = vi.fn();
    const player = new VideoPlayback(change);
    player.toggle("cell", "/clip.mp4");
    await vi.advanceTimersByTimeAsync(15000);
    expect(player.texture).toBeNull();
    expect(change).toHaveBeenLastCalledWith(null, expect.stringContaining("Couldn't play"));
  } finally {
    vi.useRealTimers();
  }
});
