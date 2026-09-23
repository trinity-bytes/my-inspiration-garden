import { useCallback, useState } from "react";
import { CanvasHost } from "./components/CanvasHost/CanvasHost";
import { LoadingScreen } from "./components/LoadingScreen/LoadingScreen";
import { Navbar } from "./components/Navbar/Navbar";
import { useOwnerSession } from "./session/useOwnerSession";

export function App() {
  const ownerSession = useOwnerSession();
  const [canvasReady, setCanvasReady] = useState(false);
  const handleCanvasReady = useCallback(() => setCanvasReady(true), []);

  return (
    <div className="app" data-owner-session={ownerSession.status}>
      <CanvasHost onReady={handleCanvasReady} />
      <Navbar isOwner={ownerSession.status === "owner"} />
      <LoadingScreen ready={canvasReady} message="Growing the garden…" />
    </div>
  );
}
