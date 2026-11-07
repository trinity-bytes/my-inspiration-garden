import type { Item } from "@garden/shared";
import { lazy, Suspense, useCallback, useState } from "react";
import { deleteItem, restoreItem } from "./api/endpoints";
import { CanvasHost } from "./components/CanvasHost/CanvasHost";
import { Navbar } from "./components/Navbar/Navbar";
import { ItemDetailModal } from "./detail/ItemDetailModal";
import { useCategoryNames } from "./detail/useCategoryNames";
import { useItemDetail } from "./detail/useItemDetail";
import { defaultFilterState } from "./filters/filter-state";
import { useCategories } from "./forms/useCategories";
import { useGardenItems } from "./items/useGardenItems";
import { useOwnerSession } from "./session/useOwnerSession";

// Owner-only dialogs load on first open: visitors never download them, and the
// entry chunk stays focused on the canvas.
const CategoryManagerModal = lazy(() =>
  import("./categories/CategoryManagerModal").then((m) => ({ default: m.CategoryManagerModal })),
);
const EditItemModal = lazy(() =>
  import("./forms/EditItemModal").then((m) => ({ default: m.EditItemModal })),
);
const QuickAddModal = lazy(() =>
  import("./forms/QuickAddModal").then((m) => ({ default: m.QuickAddModal })),
);
const RevisionHistoryModal = lazy(() =>
  import("./forms/RevisionHistoryModal").then((m) => ({ default: m.RevisionHistoryModal })),
);
const TokensModal = lazy(() =>
  import("./tokens/TokensModal").then((m) => ({ default: m.TokensModal })),
);
const TrashModal = lazy(() =>
  import("./trash/TrashModal").then((m) => ({ default: m.TrashModal })),
);

/**
 * Owner-only dialogs. They are modal (their backdrop covers the navbar and the
 * detail modal), so at most one is ever open. `edit` and `history` are scoped
 * to the open detail item.
 */
type ActiveDialog = "quickAdd" | "trash" | "categories" | "tokens" | "edit" | "history";

function isItemScopedDialog(dialog: ActiveDialog | null): boolean {
  return dialog === "edit" || dialog === "history";
}

function noop(): void {}

export function App() {
  const ownerSession = useOwnerSession();
  const isOwner = ownerSession.status === "owner";
  const [filters, setFilters] = useState(defaultFilterState());
  // The filter panel opening/closing must pause/resume canvas drift, same as
  // the item detail modal below.
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const { status: itemsStatus, items, applySavedItem, removeItem } = useGardenItems(filters);
  const { selectedItem, selectedItemId, openItem, closeItem } = useItemDetail(
    items,
    itemsStatus !== "loading",
  );
  const categoryNames = useCategoryNames();
  const categories = useCategories();

  const [activeDialog, setActiveDialog] = useState<ActiveDialog | null>(null);
  const closeDialog = useCallback(() => setActiveDialog(null), []);
  const openQuickAdd = useCallback(() => setActiveDialog("quickAdd"), []);
  const openTrash = useCallback(() => setActiveDialog("trash"), []);
  const openCategories = useCallback(() => setActiveDialog("categories"), []);
  const openTokens = useCallback(() => setActiveDialog("tokens"), []);
  const openEdit = useCallback(() => setActiveDialog("edit"), []);
  const openHistory = useCallback(() => setActiveDialog("history"), []);

  const handleCloseDetail = useCallback(() => {
    setActiveDialog((current) => (isItemScopedDialog(current) ? null : current));
    closeItem();
  }, [closeItem]);

  const handleItemSaved = useCallback(
    (item: Item) => {
      applySavedItem(item);
      handleCloseDetail();
    },
    [applySavedItem, handleCloseDetail],
  );

  // `TrashModal` only reports that a restore happened; wrapping its
  // `restoreItem` hands the restored item to the canvas without a refetch.
  const restoreFromTrash = useCallback(
    async (id: string) => {
      const restored = await restoreItem(id);
      applySavedItem(restored);
      return restored;
    },
    [applySavedItem],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedItem) return;
    try {
      await deleteItem(selectedItem.id);
      removeItem(selectedItem.id);
      handleCloseDetail();
    } catch {
      // Soft delete failed (network/permission) — leave the detail modal
      // open unchanged rather than losing the owner's place; nothing else
      // to reconcile since the item was never removed.
    }
  }, [selectedItem, removeItem, handleCloseDetail]);

  // Item-scoped dialogs only render over an open detail item, which already
  // pauses the canvas.
  const paused =
    Boolean(selectedItem) ||
    isFilterPanelOpen ||
    (activeDialog !== null && !isItemScopedDialog(activeDialog));

  return (
    <div
      className="app"
      data-owner-session={ownerSession.status}
      data-selected-item-id={selectedItemId ?? undefined}
    >
      <CanvasHost items={items} itemsStatus={itemsStatus} onItemOpen={openItem} paused={paused} />
      <Navbar
        isOwner={isOwner}
        filters={filters}
        onFiltersChange={setFilters}
        onFilterPanelOpenChange={setIsFilterPanelOpen}
        onAddClick={isOwner ? openQuickAdd : undefined}
        onTrashClick={isOwner ? openTrash : undefined}
        onCategoriesClick={isOwner ? openCategories : undefined}
        onTokensClick={isOwner ? openTokens : undefined}
      />
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          onClose={handleCloseDetail}
          categoryNames={categoryNames}
          isOwner={isOwner}
          onEdit={isOwner ? openEdit : undefined}
          onOpenHistory={isOwner ? openHistory : undefined}
          onDelete={isOwner ? handleDelete : undefined}
        />
      )}
      <Suspense fallback={null}>
        {isOwner && activeDialog === "quickAdd" && (
          <QuickAddModal categories={categories} onClose={closeDialog} onCreated={applySavedItem} />
        )}
        {isOwner && activeDialog === "trash" && (
          <TrashModal onClose={closeDialog} onRestored={noop} restoreItem={restoreFromTrash} />
        )}
        {isOwner && activeDialog === "categories" && (
          <CategoryManagerModal categories={categories} onClose={closeDialog} />
        )}
        {isOwner && activeDialog === "tokens" && <TokensModal onClose={closeDialog} />}
        {isOwner && selectedItem && activeDialog === "edit" && (
          <EditItemModal
            item={selectedItem}
            categories={categories}
            onClose={closeDialog}
            onUpdated={handleItemSaved}
          />
        )}
        {isOwner && selectedItem && activeDialog === "history" && (
          <RevisionHistoryModal
            item={selectedItem}
            onClose={closeDialog}
            onRestored={handleItemSaved}
          />
        )}
      </Suspense>
    </div>
  );
}
