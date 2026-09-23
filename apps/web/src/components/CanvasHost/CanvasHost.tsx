import "./CanvasHost.css";

/**
 * Full-viewport host for the T8 WebGL infinite canvas. Shows the tiled sky
 * as a CSS background until (or unless) the WebGL canvas mounts into
 * `.canvas-host__webgl-target`; T8 attaches its `<canvas>` there
 * imperatively, so this component intentionally does not manage a three.js
 * instance itself. The navbar and loading screen are rendered as separate,
 * independently positioned siblings (see `App.tsx`), not as children here,
 * so T8 can treat this element's subtree as its own.
 */
export function CanvasHost() {
  return (
    <div className="canvas-host" data-testid="canvas-host">
      <div className="canvas-host__webgl-target" aria-hidden="true" />
    </div>
  );
}
