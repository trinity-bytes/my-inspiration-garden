import type { Category, ItemKind } from "@garden/shared";
import { Check, Plus, RotateCcw } from "lucide-react";
import type { TagsResult } from "../api/endpoints";
import { contrastTextColor } from "../color-contrast";
import { Button } from "../components/Button/Button";
import { useSwipeToDismiss } from "../hooks/useSwipeToDismiss";
import { KIND_ICONS, KIND_LABELS } from "../items/kind-icons";
import { CategoryTree } from "./CategoryTree";
import { buildCategoryTree, type FilterState, isFilterActive, toggleValue } from "./filter-state";
import "./FilterPanel.css";

export interface FilterPanelProps {
  isOpen: boolean;
  filters: FilterState;
  onChange: (next: FilterState) => void;
  /** Closes the panel from its phone grab handle (tap or swipe down). */
  onClose?: () => void;
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
 * Filter panel: category tree, tags, kinds and color, opened from the
 * navbar's Filters button. Search lives in the navbar's own search box
 * (`FilterState.q`) and isn't duplicated here. Semantics: OR within the
 * `kinds`/`categoryIds` facets, AND within `tags` (existing API decision),
 * AND across facets, single-select `color`.
 */
export function FilterPanel({
  isOpen,
  filters,
  onChange,
  onClose = () => {},
  categories,
  tags,
}: FilterPanelProps) {
  const { sheetRef, handleProps } = useSwipeToDismiss<HTMLElement>(onClose);

  if (!isOpen) return null;

  const categoryTree = buildCategoryTree(categories);
  const isCustomColor =
    filters.color !== undefined && !COLOR_PRESETS.some((preset) => preset.hex === filters.color);

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
    <section ref={sheetRef} className="glass filter-panel" aria-label="Filters">
      <button
        type="button"
        className="filter-panel__handle"
        aria-label="Close filters"
        {...handleProps}
      />
      <div className="filter-panel__header">
        <h2 className="filter-panel__title">Filters</h2>
        {isFilterActive(filters) && (
          <Button size="sm" icon={RotateCcw} aria-label="Clear filters" onClick={clearAll}>
            Clear
          </Button>
        )}
      </div>

      <fieldset className="filter-panel__group">
        <legend>Kind</legend>
        <div className="filter-panel__chips">
          {KINDS.map((kind) => {
            const isSelected = filters.kinds.includes(kind);
            const KindIcon = isSelected ? Check : KIND_ICONS[kind];
            return (
              <button
                key={kind}
                type="button"
                className="chip chip--toggle"
                aria-pressed={isSelected}
                onClick={() => toggleKind(kind)}
              >
                <KindIcon size={14} aria-hidden="true" />
                {KIND_LABELS[kind]}
              </button>
            );
          })}
        </div>
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
          <div className="filter-panel__chips">
            {tags.map((tag) => {
              const isSelected = filters.tags.includes(tag.name);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className="chip chip--toggle"
                  aria-pressed={isSelected}
                  onClick={() => toggleTag(tag.name)}
                >
                  {isSelected && <Check size={14} aria-hidden="true" />}
                  {tag.name}{" "}
                  <span className="chip__count">
                    <span className="visually-hidden">(</span>
                    {tag.count}
                    <span className="visually-hidden">)</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="filter-panel__group">
        <legend>Color</legend>
        <div className="filter-panel__colors">
          {COLOR_PRESETS.map((preset) => {
            const isSelected = filters.color === preset.hex;
            return (
              <button
                key={preset.hex}
                type="button"
                className="filter-panel__swatch"
                style={{ backgroundColor: preset.hex, color: contrastTextColor(preset.hex) }}
                aria-label={`Filter by color ${preset.name}`}
                aria-pressed={isSelected}
                onClick={() => selectColor(preset.hex)}
              >
                {isSelected && <Check size={14} aria-hidden="true" />}
              </button>
            );
          })}
          <label
            className="filter-panel__swatch filter-panel__custom-color"
            data-active={isCustomColor || undefined}
            style={
              isCustomColor && filters.color
                ? { backgroundColor: filters.color, color: contrastTextColor(filters.color) }
                : undefined
            }
          >
            <span className="visually-hidden">Custom color</span>
            {isCustomColor ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Plus size={14} aria-hidden="true" />
            )}
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
