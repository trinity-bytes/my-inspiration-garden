import type { Item } from "@garden/shared";
import { afterEach, expect, it, vi } from "vitest";
import { CanvasEngine } from "../../src/canvas/engine";
import type { CardInstance } from "../../src/canvas/item-layout";

afterEach(() => vi.restoreAllMocks());

it("opens uploaded-video details without canvas playback and preserves other item details", async () => {
  const video = document.createElement("video");
  vi.spyOn(document, "createElement").mockReturnValue(video);
  vi.spyOn(video, "load").mockImplementation(() => {});
  vi.spyOn(video, "pause").mockImplementation(() => {});
  vi.spyOn(video, "play").mockResolvedValue();
  const open = vi.fn();
  const change = vi.fn();
  const engine = new CanvasEngine({ onItemOpen: open, onPlaybackChange: change });
  const uploaded = {
    id: "file",
    kind: "video",
    data: { provider: "file", r2Key: "clip.mp4" },
  } as Item;
  const external = { id: "youtube", kind: "video", data: { provider: "youtube" } } as Item;
  const cards = (engine as unknown as { lastCardInstances: CardInstance[] }).lastCardInstances;
  cards.push(
    ...([
      { key: "a", item: uploaded },
      { key: "b", item: uploaded },
      { key: "c", item: external },
    ] as CardInstance[]),
  );
  engine.activateCardKey("a");
  expect(open).toHaveBeenLastCalledWith("file");
  expect(video.play).not.toHaveBeenCalled();
  engine.activateCardKey("b");
  expect(open).toHaveBeenLastCalledWith("file");
  expect(video.play).not.toHaveBeenCalled();
  engine.activateCardKey("b");
  expect(open).toHaveBeenLastCalledWith("file");
  engine.activateCardKey("c");
  expect(open).toHaveBeenLastCalledWith("youtube");
  engine.setPaused(true);
  expect(change).not.toHaveBeenCalled();
  engine.activateCardKey("a");
  engine.setItems([]);
  expect(change).not.toHaveBeenCalled();
  engine.dispose();
  await Promise.resolve();
});
