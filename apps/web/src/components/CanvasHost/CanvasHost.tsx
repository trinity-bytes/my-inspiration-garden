import { useEffect, useRef } from "react";
import { CanvasEngine } from "../../canvas/engine";
import "./CanvasHost.css";

export interface CanvasHostProps {
  /** Fired once the canvas has drawn its first frame (or immediately, if WebGL is unavailable). */
  onReady?: () => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Full-viewport host for the T8 WebGL infinite canvas. Mounts a
 * `CanvasEngine` imperatively into `.canvas-host__webgl-target` — vanilla
 * three.js, not r3f; React only owns lifecycle here. The target div is the
 * focusable navigation region (arrow keys / WASD pan it while focused; see
 * `canvas/navigation-controller.ts`), so it carries `tabIndex=0` and an
 * accessible label instead of `aria-hidden`. Until (or unless) the engine
 * mounts, `CanvasHost.css` shows the tiled sky as a static CSS background.
 */
export function CanvasHost({ onReady }: CanvasHostProps) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const target = targetRef.current;
    if (!target) {
      return;
    }
    // Set imperatively (rather than as a static JSX prop) so this
    // intentionally-focusable div — role="application" opts it into its own
    // keyboard model, arrow keys / WASD panning via NavigationController —
    // doesn't trip the generic "non-interactive element" a11y lint.
    target.tabIndex = 0;

    const engine = new CanvasEngine({
      reducedMotion: prefersReducedMotion(),
      onReady: () => onReadyRef.current?.(),
      // WebGL failures (unsupported, lost context, texture load errors) fall
      // back to the CSS sky background in CanvasHost.css; nothing to do here.
      onError: () => {},
    });
    engine.mount(target);

    let motionQuery: MediaQueryList | null = null;
    const handleMotionChange = (event: MediaQueryListEvent) => {
      engine.setReducedMotion(event.matches);
    };
    if (typeof window.matchMedia === "function") {
      try {
        motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        motionQuery.addEventListener("change", handleMotionChange);
      } catch {
        motionQuery = null;
      }
    }

    return () => {
      motionQuery?.removeEventListener("change", handleMotionChange);
      engine.dispose();
    };
  }, []);

  return (
    <div className="canvas-host" data-testid="canvas-host">
      <div
        ref={targetRef}
        className="canvas-host__webgl-target"
        role="application"
        aria-label="Inspiration garden canvas. Move the cursor, drag, or use arrow keys to look around."
      />
    </div>
  );
}
