import "./LoadingScreen.css";

export interface LoadingScreenProps {
  /** True once the app is ready to reveal the canvas; fades the screen out. */
  ready: boolean;
  message: string;
}

/**
 * Landscape-backed loading screen shown over the canvas host until the app
 * (T8's canvas, initial data) is ready. Fades out via CSS opacity — the
 * transition duration collapses under `prefers-reduced-motion`. Once
 * `ready`, it is marked `aria-hidden` and stops intercepting pointer events
 * so it never traps focus or announces stale status text.
 */
export function LoadingScreen({ ready, message }: LoadingScreenProps) {
  return (
    <div
      className={`loading-screen${ready ? " loading-screen--ready" : ""}`}
      data-testid="loading-screen"
      aria-hidden={ready ? "true" : undefined}
    >
      <p className="loading-screen__message" role="status">
        {message}
      </p>
    </div>
  );
}
