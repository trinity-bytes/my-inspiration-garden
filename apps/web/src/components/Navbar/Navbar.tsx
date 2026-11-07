import { FolderTree, KeyRound, LogOut, Plus, Trash2 } from "lucide-react";
import { type PointerEvent, useEffect, useRef } from "react";
import { isClick } from "../../canvas/click-vs-drag";
import { NAVIGATION_BLOCKER_ATTRIBUTE } from "../../canvas/navigation-controller";
import type { Vec2 } from "../../canvas/types";
import { FilterPanel } from "../../filters/FilterPanel";
import {
  countActiveFilters,
  defaultFilterState,
  type FilterState,
} from "../../filters/filter-state";
import { useFilterOptions } from "../../filters/useFilterOptions";
import { useDisclosure } from "../../hooks/useDisclosure";
import { useKeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import { IconButton } from "../IconButton/IconButton";
import { AccountMenu, type AccountMenuAction } from "./AccountMenu";
import "./Navbar.css";
import { SearchBar } from "./SearchBar";

export interface NavbarProps {
  /** Shows a discreet "Sign out" link when true. No public sign-in button
   * is shown either way — the owner reaches `/auth/login` directly. */
  isOwner?: boolean;
  /** Current filter/search state. Defaults to no filters when omitted. */
  filters?: FilterState;
  /** Called with the next filter state on every search or filter-panel change. */
  onFiltersChange?: (next: FilterState) => void;
  /** Called whenever the filter panel's own open/closed state changes (the
   * canvas's cursor-drift navigation must pause while the panel is open — see `App`, which
   * feeds this into `CanvasHost`'s `paused` prop). */
  onFilterPanelOpenChange?: (isOpen: boolean) => void;
  /** Opens the owner-only quick-add modal. Only rendered when `isOwner` and this is provided. */
  onAddClick?: () => void;
  /** Opens the owner-only trash modal. Only rendered when `isOwner` and this is provided. */
  onTrashClick?: () => void;
  /** Opens the owner-only category manager modal. Only rendered when `isOwner` and this is provided. */
  onCategoriesClick?: () => void;
  /** Opens the owner-only API tokens modal. Only rendered when `isOwner` and this is provided. */
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
 * Navbar v2 (Figma Proposals `26:163`, phone `26:567`): a centered glass pill
 * only as wide as its content. Find: the search bar (⌘K/Ctrl+K focuses it,
 * drives `FilterState.q`) with Filters inside it, opening the filter panel.
 * For the owner: Add (the one accent action), the management icon buttons
 * and Sign out, split by hairline dividers. On phones the management actions
 * and Sign out move into the account menu. The page heading stays for
 * assistive technology only.
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
  const navbarRef = useRef<HTMLElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const filtersDisclosure = useDisclosure();
  const { isOpen: filtersOpen, close: closeFilters } = filtersDisclosure;
  const { categories, tags } = useFilterOptions();

  useKeyboardShortcut("k", () => {
    searchRef.current?.focus();
  });

  useEffect(() => {
    onFilterPanelOpenChange?.(filtersDisclosure.isOpen);
  }, [filtersDisclosure.isOpen, onFilterPanelOpenChange]);

  // A tap outside the navbar (the panel lives inside it) or Escape closes the panel. A drag
  // outside is the canvas panning behind it, which keeps the panel open so results stay in
  // view. The Filters button is inside the navbar too, so it keeps toggling on its own.
  useEffect(() => {
    if (!filtersOpen) return;
    let outsideDown: Vec2 | null = null;
    function onPointerDown(event: globalThis.PointerEvent) {
      outsideDown = navbarRef.current?.contains(event.target as Node)
        ? null
        : { x: event.clientX, y: event.clientY };
    }
    function onPointerUp(event: globalThis.PointerEvent) {
      if (outsideDown && isClick(outsideDown, { x: event.clientX, y: event.clientY })) {
        closeFilters();
      }
      outsideDown = null;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      closeFilters();
      filtersButtonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen, closeFilters]);

  const signOutHref = "/cdn-cgi/access/logout";
  const manageActions = [
    isOwner && onTrashClick && { label: "Trash", icon: Trash2, onSelect: onTrashClick },
    isOwner &&
      onCategoriesClick && {
        label: "Categories",
        icon: FolderTree,
        onSelect: onCategoriesClick,
      },
    isOwner && onTokensClick && { label: "API tokens", icon: KeyRound, onSelect: onTokensClick },
  ].filter((action): action is AccountMenuAction => Boolean(action));

  return (
    <header
      ref={navbarRef}
      className="glass navbar"
      onPointerMove={trackGlassHighlight}
      {...{ [NAVIGATION_BLOCKER_ATTRIBUTE]: "" }}
    >
      <h1 className="visually-hidden">Inspiration Garden</h1>
      <SearchBar
        ref={searchRef}
        value={filters.q}
        onChange={(q) => onFiltersChange({ ...filters, q })}
        filtersOpen={filtersDisclosure.isOpen}
        onFiltersToggle={filtersDisclosure.toggle}
        filtersButtonRef={filtersButtonRef}
        activeFilterCount={countActiveFilters(filters)}
      />
      {isOwner && (
        <>
          <span className="navbar__divider" aria-hidden="true" />
          {onAddClick && (
            <IconButton icon={Plus} label="Add item" tone="accent" onClick={onAddClick} />
          )}
          {manageActions.length > 0 && (
            <div className="navbar__group navbar__manage">
              {manageActions.map(({ label, icon, onSelect }) => (
                <IconButton key={label} icon={icon} label={label} onClick={onSelect} />
              ))}
            </div>
          )}
          <span className="navbar__divider navbar__session-divider" aria-hidden="true" />
          <span className="has-tooltip navbar__session">
            <a
              className="icon-button icon-button--neutral"
              href={signOutHref}
              aria-label="Sign out"
            >
              <LogOut size={20} aria-hidden="true" />
            </a>
            <span className="tooltip" aria-hidden="true">
              Sign out
            </span>
          </span>
          <AccountMenu actions={manageActions} signOutHref={signOutHref} signOutIcon={LogOut} />
        </>
      )}
      <FilterPanel
        isOpen={filtersDisclosure.isOpen}
        filters={filters}
        onChange={onFiltersChange}
        onClose={closeFilters}
        categories={categories}
        tags={tags}
      />
    </header>
  );
}
