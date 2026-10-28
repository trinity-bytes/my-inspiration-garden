import { type PointerEvent, useEffect, useRef } from "react";
import { NAVIGATION_BLOCKER_ATTRIBUTE } from "../../canvas/navigation-controller";
import { FilterPanel } from "../../filters/FilterPanel";
import { defaultFilterState, type FilterState } from "../../filters/filter-state";
import { useFilterOptions } from "../../filters/useFilterOptions";
import { useDisclosure } from "../../hooks/useDisclosure";
import { useKeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import "./Navbar.css";
import { FiltersButton } from "./FiltersButton";
import { SearchInput } from "./SearchInput";

export interface NavbarProps {
  /** Shows a discreet "Sign out" link when true. No public sign-in button
   * is shown either way — the owner reaches `/auth/login` directly. */
  isOwner?: boolean;
  /** Current filter/search state (T10). Defaults to no filters when omitted. */
  filters?: FilterState;
  /** Called with the next filter state on every search or filter-panel change. */
  onFiltersChange?: (next: FilterState) => void;
  /** Called whenever the filter panel's own open/closed state changes (T10 owner QA: the
   * canvas's cursor-drift navigation must pause while the panel is open — see `App`, which
   * feeds this into `CanvasHost`'s `paused` prop). */
  onFilterPanelOpenChange?: (isOpen: boolean) => void;
  /** T11: opens the owner-only quick-add modal. Only rendered when `isOwner` and this is provided. */
  onAddClick?: () => void;
  /** T11: opens the owner-only trash modal. Only rendered when `isOwner` and this is provided. */
  onTrashClick?: () => void;
  /** T11b B6: opens the owner-only category manager modal. Only rendered when `isOwner` and this is provided. */
  onCategoriesClick?: () => void;
  /** T12: opens the owner-only API tokens modal. Only rendered when `isOwner` and this is provided. */
  onTokensClick?: () => void;
}

/** Feeds the pointer position (as % of the navbar box) to the liquid-glass highlight in `Navbar.css`. */
function trackGlassHighlight(event: PointerEvent<HTMLElement>) {
  const navbar = event.currentTarget;
  const rect = navbar.getBoundingClientRect();
  navbar.style.setProperty("--glass-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  navbar.style.setProperty("--glass-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

/**
 * Liquid-glass top navbar: brand wordmark, search (⌘K/Ctrl+K focuses it,
 * drives `FilterState.q`), a Filters button that opens the filter panel
 * (category tree, tags, kinds, color — T10) and — for the owner only — a
 * sign-out link.
 */
export function Navbar({
  isOwner = false,
  filters = defaultFilterState(),
  onFiltersChange = () => {},
  onFilterPanelOpenChange,
  onAddClick,
  onTrashClick,
  onCategoriesClick,
  onTokensClick,
}: NavbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const filtersDisclosure = useDisclosure();
  const { categories, tags } = useFilterOptions();

  useKeyboardShortcut("k", () => {
    searchRef.current?.focus();
  });

  useEffect(() => {
    onFilterPanelOpenChange?.(filtersDisclosure.isOpen);
  }, [filtersDisclosure.isOpen, onFilterPanelOpenChange]);

  return (
    <header
      className="glass navbar"
      onPointerMove={trackGlassHighlight}
      {...{ [NAVIGATION_BLOCKER_ATTRIBUTE]: "" }}
    >
      <h1 className="navbar__brand">Inspiration Garden</h1>
      <SearchInput
        ref={searchRef}
        value={filters.q}
        onChange={(q) => onFiltersChange({ ...filters, q })}
      />
      <FiltersButton isOpen={filtersDisclosure.isOpen} onToggle={filtersDisclosure.toggle} />
      {isOwner && onAddClick && (
        <button type="button" className="navbar__add-button" onClick={onAddClick}>
          Add item
        </button>
      )}
      {isOwner && onTrashClick && (
        <button type="button" className="navbar__trash-button" onClick={onTrashClick}>
          Trash
        </button>
      )}
      {isOwner && onCategoriesClick && (
        <button type="button" className="navbar__categories-button" onClick={onCategoriesClick}>
          Categories
        </button>
      )}
      {isOwner && onTokensClick && (
        <button type="button" className="navbar__tokens-button" onClick={onTokensClick}>
          API tokens
        </button>
      )}
      {isOwner && (
        <a className="navbar__signout" href="/cdn-cgi/access/logout">
          Sign out
        </a>
      )}
      <FilterPanel
        isOpen={filtersDisclosure.isOpen}
        filters={filters}
        onChange={onFiltersChange}
        categories={categories}
        tags={tags}
      />
    </header>
  );
}
