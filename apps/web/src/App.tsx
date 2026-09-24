import { useCallback, useState } from "react";
import { CanvasHost } from "./components/CanvasHost/CanvasHost";
import { LoadingScreen } from "./components/LoadingScreen/LoadingScreen";
import { Navbar } from "./components/Navbar/Navbar";
import { useGardenItems } from "./items/useGardenItems";
import { useOwnerSession } from "./session/useOwnerSession";

export function App() {
  const ownerSession = useOwnerSession();
  const [canvasReady, setCanvasReady] = useState(false);
  const handleCanvasReady = useCallback(() => setCanvasReady(true), []);

  const { status: itemsStatus, items } = useGardenItems();
  // T9 renders the detail view for `selectedItemId`; T8b only wires the
  // hook up to the canvas's click/Enter handling (see `CanvasHost`'s
  // `onItemOpen`). Exposed as a data attribute so the wiring itself is
  // observable/testable before T9 exists.
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const handleItemOpen = useCallback((itemId: string) => setSelectedItemId(itemId), []);

  return (
    <div
      className="app"
      data-owner-session={ownerSession.status}
      data-selected-item-id={selectedItemId ?? undefined}
    >
      <CanvasHost
        onReady={handleCanvasReady}
        items={items}
        itemsStatus={itemsStatus}
        onItemOpen={handleItemOpen}
      />
      <Navbar isOwner={ownerSession.status === "owner"} />
      <LoadingScreen ready={canvasReady} message="Growing the garden…" />
    </div>
  );
}
