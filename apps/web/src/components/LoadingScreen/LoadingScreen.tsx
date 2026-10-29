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
      <p className="glass message-pill" role="status">
        <svg className="message-pill__ring" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
        </svg>
        {message}
      </p>
    </div>
  );
}
