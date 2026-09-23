import { CanvasHost } from "./components/CanvasHost/CanvasHost";
import { LoadingScreen } from "./components/LoadingScreen/LoadingScreen";
import { Navbar } from "./components/Navbar/Navbar";
import { useOwnerSession } from "./session/useOwnerSession";

// T8 flips this once the WebGL canvas has mounted and drawn its first
// frame; until then the loading screen stays up. Hardcoded false is
// intentional for T7 — the canvas does not exist yet.
const CANVAS_READY = false;

export function App() {
  const ownerSession = useOwnerSession();

  return (
    <div className="app" data-owner-session={ownerSession.status}>
      <CanvasHost />
      <Navbar />
      <LoadingScreen ready={CANVAS_READY} message="Growing the garden…" />
    </div>
  );
}
