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

    function finish(frame: HTMLCanvasElement | null): void {
      clearTimeout(timer);
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

    function capture(): void {
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
    video.addEventListener("loadeddata", capture);
    video.addEventListener("error", fail);
    video.src = url;
    video.load();
  });
}
