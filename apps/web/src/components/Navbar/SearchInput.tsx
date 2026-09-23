import { forwardRef } from "react";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

/** Presentational search field. Label is visually hidden but always announced. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange },
  ref,
) {
  return (
    <div className="navbar__search">
      <label className="visually-hidden" htmlFor="garden-search">
        Search the garden
      </label>
      <input
        ref={ref}
        id="garden-search"
        type="search"
        className="navbar__search-input"
        placeholder="Search the garden…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <kbd className="navbar__search-hint">⌘K</kbd>
    </div>
  );
});
