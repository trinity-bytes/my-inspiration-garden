import { useCallback, useState } from "react";
import { CanvasHost } from "./components/CanvasHost/CanvasHost";
import { LoadingScreen } from "./components/LoadingScreen/LoadingScreen";
import { Navbar } from "./components/Navbar/Navbar";
import { ItemDetailModal } from "./detail/ItemDetailModal";
import { useCategoryNames } from "./detail/useCategoryNames";
import { useItemDetail } from "./detail/useItemDetail";
import { defaultFilterState } from "./filters/filter-state";
import { useGardenItems } from "./items/useGardenItems";
import { useOwnerSession } from "./session/useOwnerSession";

export function App() {
  const ownerSession = useOwnerSession();
  const [canvasReady, setCanvasReady] = useState(false);
  const handleCanvasReady = useCallback(() => setCanvasReady(true), []);
  const [filters, setFilters] = useState(defaultFilterState());

  const { status: itemsStatus, items } = useGardenItems(filters);
  const { selectedItem, selectedItemId, openItem, closeItem } = useItemDetail(
    items,
    itemsStatus !== "loading",
  );
  const categoryNames = useCategoryNames();

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
        onItemOpen={openItem}
        paused={Boolean(selectedItem)}
      />
      <Navbar
        isOwner={ownerSession.status === "owner"}
        filters={filters}
        onFiltersChange={setFilters}
      />
      <LoadingScreen ready={canvasReady} message="Growing the garden…" />
      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={closeItem} categoryNames={categoryNames} />
      )}
    </div>
  );
}
