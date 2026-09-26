import { useCallback, useState } from "react";
import { deleteItem } from "./api/endpoints";
import { CategoryManagerModal } from "./categories/CategoryManagerModal";
import { CanvasHost } from "./components/CanvasHost/CanvasHost";
import { LoadingScreen } from "./components/LoadingScreen/LoadingScreen";
import { Navbar } from "./components/Navbar/Navbar";
import { ItemDetailModal } from "./detail/ItemDetailModal";
import { useCategoryNames } from "./detail/useCategoryNames";
import { useItemDetail } from "./detail/useItemDetail";
import { defaultFilterState } from "./filters/filter-state";
import { EditItemModal } from "./forms/EditItemModal";
import { QuickAddModal } from "./forms/QuickAddModal";
import { RevisionHistoryModal } from "./forms/RevisionHistoryModal";
import { useCategories } from "./forms/useCategories";
import { useGardenItems } from "./items/useGardenItems";
import { useOwnerSession } from "./session/useOwnerSession";
import { TokensModal } from "./tokens/TokensModal";
import { TrashModal } from "./trash/TrashModal";

export function App() {
  const ownerSession = useOwnerSession();
  const isOwner = ownerSession.status === "owner";
  const [canvasReady, setCanvasReady] = useState(false);
  const handleCanvasReady = useCallback(() => setCanvasReady(true), []);
  const [filters, setFilters] = useState(defaultFilterState());
  // T10 owner QA: the filter panel opening/closing must pause/resume canvas
  // drift, same as the item detail modal below.
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const { status: itemsStatus, items, refetch } = useGardenItems(filters);
  const { selectedItem, selectedItemId, openItem, closeItem } = useItemDetail(
    items,
    itemsStatus !== "loading",
  );
  const categoryNames = useCategoryNames();
  const categories = useCategories();

  // T11 owner-only dialogs: quick-add, trash, and — scoped to the currently
  // open detail item — edit and revision history.
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // T11b B6: owner-only category manager, opened from the navbar.
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  // T12: owner-only API tokens manager, opened from the navbar.
  const [isTokensOpen, setIsTokensOpen] = useState(false);

  const handleCloseDetail = useCallback(() => {
    setIsEditOpen(false);
    setIsHistoryOpen(false);
    closeItem();
  }, [closeItem]);

  const handleUpdated = useCallback(() => {
    refetch();
    handleCloseDetail();
  }, [refetch, handleCloseDetail]);

  const handleRevisionRestored = useCallback(() => {
    refetch();
    handleCloseDetail();
  }, [refetch, handleCloseDetail]);

  const handleDelete = useCallback(async () => {
    if (!selectedItem) return;
    try {
      await deleteItem(selectedItem.id);
      refetch();
      handleCloseDetail();
    } catch {
      // Soft delete failed (network/permission) — leave the detail modal
      // open unchanged rather than losing the owner's place; nothing else
      // to reconcile since the item was never removed.
    }
  }, [selectedItem, refetch, handleCloseDetail]);

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
        paused={
          Boolean(selectedItem) ||
          isFilterPanelOpen ||
          isQuickAddOpen ||
          isTrashOpen ||
          isCategoriesOpen ||
          isTokensOpen
        }
      />
      <Navbar
        isOwner={isOwner}
        filters={filters}
        onFiltersChange={setFilters}
        onFilterPanelOpenChange={setIsFilterPanelOpen}
        onAddClick={isOwner ? () => setIsQuickAddOpen(true) : undefined}
        onTrashClick={isOwner ? () => setIsTrashOpen(true) : undefined}
        onCategoriesClick={isOwner ? () => setIsCategoriesOpen(true) : undefined}
        onTokensClick={isOwner ? () => setIsTokensOpen(true) : undefined}
      />
      <LoadingScreen ready={canvasReady} message="Growing the garden…" />
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          onClose={handleCloseDetail}
          categoryNames={categoryNames}
          isOwner={isOwner}
          onEdit={isOwner ? () => setIsEditOpen(true) : undefined}
          onOpenHistory={isOwner ? () => setIsHistoryOpen(true) : undefined}
          onDelete={isOwner ? handleDelete : undefined}
        />
      )}
      {isOwner && isQuickAddOpen && (
        <QuickAddModal
          categories={categories}
          onClose={() => setIsQuickAddOpen(false)}
          onCreated={refetch}
        />
      )}
      {isOwner && isTrashOpen && (
        <TrashModal onClose={() => setIsTrashOpen(false)} onRestored={refetch} />
      )}
      {isOwner && isCategoriesOpen && (
        <CategoryManagerModal categories={categories} onClose={() => setIsCategoriesOpen(false)} />
      )}
      {isOwner && isTokensOpen && <TokensModal onClose={() => setIsTokensOpen(false)} />}
      {isOwner && selectedItem && isEditOpen && (
        <EditItemModal
          item={selectedItem}
          categories={categories}
          onClose={() => setIsEditOpen(false)}
          onUpdated={handleUpdated}
        />
      )}
      {isOwner && selectedItem && isHistoryOpen && (
        <RevisionHistoryModal
          item={selectedItem}
          onClose={() => setIsHistoryOpen(false)}
          onRestored={handleRevisionRestored}
        />
      )}
    </div>
  );
}
