import * as THREE from "three";

/** Owns the sole live decoder. Live textures never enter the poster cache. */
export class VideoPlayback {
  key: string | null = null;
  texture: THREE.VideoTexture | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onChange: (key: string | null, error?: string) => void) {}

  toggle(key: string, url: string): void {
    const stopping = this.key === key;
    this.stop();
    if (stopping) return;
    const video = document.createElement("video");
    this.video = video;
    this.key = key;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.playsInline = true;
    video.loop = true;
    video.src = url;
    this.texture = new THREE.VideoTexture(video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const fail = () => {
      if (this.video !== video) return;
      this.stop();
      this.onChange(null, "Couldn't play this video. Try again or open details.");
    };
    video.onerror = fail;
    video.onplaying = () => {
      if (this.video === video && this.timer) clearTimeout(this.timer);
      this.timer = null;
    };
    this.timer = setTimeout(fail, 15000);
    this.onChange(key);
    try {
      void video.play().catch(fail);
    } catch {
      fail();
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.video) {
      this.video.onerror = null;
      this.video.onplaying = null;
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
      this.video = null;
    }
    this.texture?.dispose();
    this.texture = null;
    const wasActive = this.key !== null;
    this.key = null;
    if (wasActive) this.onChange(null);
  }
}
