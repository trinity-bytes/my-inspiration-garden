/** Decode one frame without playback. The composed-texture cache owns the result. */
export function loadVideoFrame(
  url: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    let finished = false;
    let seeking = false;
    function finish(frame: HTMLCanvasElement | null): void {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", seek);
      video.removeEventListener("seeked", capture);
      video.removeEventListener("loadeddata", capture);
      video.removeEventListener("error", fail);
      video.pause();
      video.removeAttribute("src");
      video.load();
      resolve(frame);
    }

    function fail(): void {
      finish(null);
    }

    function seek(): void {
      if (seeking || finished) return;
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0.1) {
        seeking = true;
        video.currentTime = Math.min(1, duration / 4);
      }
    }

    function capture(): void {
      if (finished || (seeking && video.seeking)) return;
      if (!seeking && Number.isFinite(video.duration) && video.duration > 0.1) {
        seek();
        return;
      }
      try {
        if (!video.videoWidth || !video.videoHeight) {
          fail();
          return;
        }
        const canvas = document.createElement("canvas");
        // Keep the source aspect ratio so the card's cover crop stays correct.
        const scale = Math.min(1, Math.max(width / video.videoWidth, height / video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          fail();
          return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas);
      } catch {
        fail();
      }
    }

    const timer = setTimeout(fail, 8000);
    video.addEventListener("loadedmetadata", seek);
    video.addEventListener("seeked", capture);
    video.addEventListener("loadeddata", capture);
    video.addEventListener("error", fail);
    video.src = url;
    video.load();
  });
}
