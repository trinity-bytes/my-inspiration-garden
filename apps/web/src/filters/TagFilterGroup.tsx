import { Check, ChevronDown, ChevronUp, Search, Tag } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "../components/Button/Button";
import { matchTags, sortTags, type TagSort, type TagWithCount } from "./tag-list";

/** How many tags show before "Show all", most used first (Figma "Proposal · Tags"). */
export const TAG_PREVIEW_COUNT = 12;

export interface TagFilterGroupProps {
  tags: TagWithCount[];
  selected: string[];
  onToggle: (tagName: string) => void;
  /** Opens the owner's tag manager; the button only renders when this is given. */
  onManageTags?: () => void;
}

const SORT_OPTIONS: { value: TagSort; label: string }[] = [
  { value: "count", label: "Most used" },
  { value: "name", label: "A–Z" },
];

/**
 * The filter panel's Tags group: sort (most used or A–Z), a name filter, and
 * the first {@link TAG_PREVIEW_COUNT} tags behind "Show all". A selected tag
 * always stays visible so it can be turned off; while the filter has text,
 * every match shows.
 */
export function TagFilterGroup({ tags, selected, onToggle, onManageTags }: TagFilterGroupProps) {
  const labelId = useId();
  const filterId = useId();
  const [sort, setSort] = useState<TagSort>("count");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const isFiltering = query.trim().length > 0;
  const sorted = sortTags(tags, sort);
  const matches = matchTags(sorted, query);
  const isTruncated = !isFiltering && !showAll && matches.length > TAG_PREVIEW_COUNT;
  const visible = isTruncated
    ? matches.filter((tag, index) => index < TAG_PREVIEW_COUNT || selected.includes(tag.name))
    : matches;
  const canToggleShowAll = !isFiltering && tags.length > TAG_PREVIEW_COUNT;

  return (
    // biome-ignore lint/a11y/useSemanticElements: the label shares a row with the sort toggle, which a fieldset legend cannot do.
    <div role="group" aria-labelledby={labelId} className="filter-panel__group">
      <div className="filter-panel__group-header">
        <span id={labelId} className="filter-panel__legend">
          Tags
        </span>
        {/* biome-ignore lint/a11y/useSemanticElements: a pair of toggle buttons, not a form fieldset. */}
        <div role="group" aria-label="Sort tags" className="filter-panel__sort">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip chip--toggle"
              aria-pressed={sort === option.value}
              onClick={() => setSort(option.value)}
            >
              {sort === option.value && <Check size={14} aria-hidden="true" />}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <label className="visually-hidden" htmlFor={filterId}>
        Filter tags
      </label>
      <span className="control-with-icon filter-panel__tag-filter">
        <Search size={16} aria-hidden="true" />
        <input
          id={filterId}
          type="search"
          placeholder={`Filter ${tags.length} tags`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </span>

      <div className="filter-panel__chips">
        {visible.map((tag) => {
          const isSelected = selected.includes(tag.name);
          return (
            <button
              key={tag.id}
              type="button"
              className="chip chip--toggle"
              data-tag={tag.name}
              aria-pressed={isSelected}
              onClick={() => onToggle(tag.name)}
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

      {(isFiltering || canToggleShowAll || onManageTags) && (
        <div className="filter-panel__tags-footer">
          {isFiltering && (
            <span className="filter-panel__match-count" aria-live="polite">
              {matches.length} of {tags.length} tags
            </span>
          )}
          {canToggleShowAll && (
            <Button
              size="sm"
              icon={showAll ? ChevronUp : ChevronDown}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show fewer" : `Show all ${tags.length}`}
            </Button>
          )}
          {onManageTags && (
            <Button
              size="sm"
              icon={Tag}
              className="filter-panel__manage-tags"
              onClick={onManageTags}
            >
              Manage tags
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
