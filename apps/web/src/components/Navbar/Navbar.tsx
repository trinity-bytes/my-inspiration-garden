import { useRef } from "react";
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
}

/**
 * Frosted-glass top navbar: brand wordmark, search (⌘K/Ctrl+K focuses it,
 * drives `FilterState.q`), a Filters button that opens the filter panel
 * (category tree, tags, kinds, color — T10) and — for the owner only — a
 * sign-out link.
 */
export function Navbar({
  isOwner = false,
  filters = defaultFilterState(),
  onFiltersChange = () => {},
}: NavbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const filtersDisclosure = useDisclosure();
  const { categories, tags } = useFilterOptions();

  useKeyboardShortcut("k", () => {
    searchRef.current?.focus();
  });

  return (
    <header className="navbar">
      <h1 className="navbar__brand">Inspiration Garden</h1>
      <SearchInput
        ref={searchRef}
        value={filters.q}
        onChange={(q) => onFiltersChange({ ...filters, q })}
      />
      <FiltersButton isOpen={filtersDisclosure.isOpen} onToggle={filtersDisclosure.toggle} />
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
