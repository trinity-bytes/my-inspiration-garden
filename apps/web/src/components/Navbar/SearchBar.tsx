import { Search, SlidersHorizontal } from "lucide-react";
import { forwardRef, type Ref } from "react";

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  filtersOpen: boolean;
  onFiltersToggle: () => void;
  /** Number of applied filters (search text excluded); shown as a badge when > 0. */
  activeFilterCount: number;
  /** The Filters button, so closing the panel can hand focus back to it. */
  filtersButtonRef?: Ref<HTMLButtonElement>;
}

/**
 * Search Bar (Figma Components `28:165`): the search field with Filters as an
 * internal action behind a hairline divider, so filtering reads as "refine
 * this search". The label is visually hidden but always announced.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, filtersOpen, onFiltersToggle, activeFilterCount, filtersButtonRef },
  ref,
) {
  const filtersLabel = activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filters";

  return (
    <div className="search-bar">
      <Search className="search-bar__icon" size={16} aria-hidden="true" />
      <label className="visually-hidden" htmlFor="garden-search">
        Search the garden
      </label>
      <input
        ref={ref}
        id="garden-search"
        type="search"
        className="search-bar__input"
        placeholder="Search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <kbd className="search-bar__hint">⌘K</kbd>
      <span className="search-bar__divider" aria-hidden="true" />
      <span className="has-tooltip">
        <button
          ref={filtersButtonRef}
          type="button"
          className="search-bar__filters"
          aria-label={filtersLabel}
          aria-expanded={filtersOpen}
          onClick={onFiltersToggle}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {activeFilterCount > 0 && (
            <span className="search-bar__count" aria-hidden="true">
              {activeFilterCount}
            </span>
          )}
        </button>
        <span className="tooltip" aria-hidden="true">
          Filters
        </span>
      </span>
    </div>
  );
});
