export interface FiltersButtonProps {
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Presentational stub: toggles `aria-expanded` state only. Opens nothing
 * yet — the actual filter panel is built in T10.
 */
export function FiltersButton({ isOpen, onToggle }: FiltersButtonProps) {
  return (
    <button
      type="button"
      className="navbar__filters-button"
      aria-expanded={isOpen}
      onClick={onToggle}
    >
      Filters
    </button>
  );
}
