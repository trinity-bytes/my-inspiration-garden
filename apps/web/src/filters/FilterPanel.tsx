import type { Category, ItemKind } from "@garden/shared";
import type { TagsResult } from "../api/endpoints";
import { CategoryTree } from "./CategoryTree";
import { buildCategoryTree, type FilterState, isFilterActive, toggleValue } from "./filter-state";
import "./FilterPanel.css";

export interface FilterPanelProps {
  isOpen: boolean;
  filters: FilterState;
  onChange: (next: FilterState) => void;
  categories: Category[];
  tags: TagsResult["tags"];
}

const KINDS: ItemKind[] = ["image", "link", "text", "video", "palette", "font"];

/** Preset swatches drawn from the theme's own tokens (`styles/tokens.css`) — no arbitrary colors. */
const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "lavender", hex: "#D5CBE8" },
  { name: "deep lavender", hex: "#5E4C82" },
  { name: "apricot", hex: "#F29A6B" },
  { name: "burnt apricot", hex: "#E0784E" },
  { name: "ink", hex: "#2A2140" },
];

/**
 * Filter panel (T10): category tree, tags, kinds and color, opened from the
 * navbar's Filters button. Search lives in the navbar's own search box
 * (`FilterState.q`) and isn't duplicated here. Semantics: OR within the
 * `kinds`/`categoryIds` facets, AND within `tags` (existing API decision,
 * T4/T5 — unrevisited here), AND across facets, single-select `color`.
 */
export function FilterPanel({ isOpen, filters, onChange, categories, tags }: FilterPanelProps) {
  if (!isOpen) return null;

  const categoryTree = buildCategoryTree(categories);

  function toggleKind(kind: ItemKind): void {
    onChange({ ...filters, kinds: toggleValue(filters.kinds, kind) });
  }

  function toggleCategory(categoryId: string): void {
    onChange({ ...filters, categoryIds: toggleValue(filters.categoryIds, categoryId) });
  }

  function toggleTag(tagName: string): void {
    onChange({ ...filters, tags: toggleValue(filters.tags, tagName) });
  }

  function selectColor(hex: string): void {
    onChange({ ...filters, color: filters.color === hex ? undefined : hex });
  }

  function clearAll(): void {
    onChange({ kinds: [], tags: [], categoryIds: [], color: undefined, q: "" });
  }

  return (
    <section className="filter-panel" aria-label="Filters">
      <div className="filter-panel__header">
        <h2 className="filter-panel__title">Filters</h2>
        {isFilterActive(filters) && (
          <button type="button" className="filter-panel__clear" onClick={clearAll}>
            Clear filters
          </button>
        )}
      </div>

      <fieldset className="filter-panel__group">
        <legend>Kind</legend>
        {KINDS.map((kind) => (
          <label className="filter-panel__option" key={kind}>
            <input
              type="checkbox"
              checked={filters.kinds.includes(kind)}
              onChange={() => toggleKind(kind)}
            />
            {kind}
          </label>
        ))}
      </fieldset>

      {categoryTree.length > 0 && (
        <fieldset className="filter-panel__group">
          <legend>Category</legend>
          <CategoryTree
            nodes={categoryTree}
            selectedIds={filters.categoryIds}
            onToggle={toggleCategory}
          />
        </fieldset>
      )}

      {tags.length > 0 && (
        <fieldset className="filter-panel__group">
          <legend>Tags</legend>
          <div className="filter-panel__tags">
            {tags.map((tag) => {
              const isSelected = filters.tags.includes(tag.name);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className="filter-panel__tag"
                  aria-pressed={isSelected}
                  data-selected={isSelected}
                  onClick={() => toggleTag(tag.name)}
                >
                  {tag.name} ({tag.count})
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="filter-panel__group">
        <legend>Color</legend>
        <div className="filter-panel__colors">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              className="filter-panel__swatch"
              style={{ backgroundColor: preset.hex }}
              aria-label={`Filter by color ${preset.name}`}
              aria-pressed={filters.color === preset.hex}
              data-selected={filters.color === preset.hex}
              onClick={() => selectColor(preset.hex)}
            />
          ))}
          <label className="filter-panel__custom-color">
            <span className="visually-hidden">Custom color</span>
            <input
              type="color"
              value={filters.color ?? "#000000"}
              onChange={(event) => onChange({ ...filters, color: event.target.value })}
            />
          </label>
        </div>
      </fieldset>
    </section>
  );
}
