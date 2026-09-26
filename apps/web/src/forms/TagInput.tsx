import { useEffect, useId, useMemo, useState } from "react";
import { getTags as getTagsDefault, type TagsResult } from "../api/endpoints";
import "./TagInput.css";

export interface TagInputProps {
  id: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  getTags?: () => Promise<TagsResult>;
}

/** Strips diacritics and lowercases, for case/accent-insensitive tag matching. */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Accessible chip-based tag input with autocomplete (T11b B3). Replaces the
 * old comma-separated free-text field: existing tags render as removable
 * chips, and typing suggests matches from `GET /api/tags` (excluding
 * already-selected tags, sorted by item count). Enter/comma/Tab commits the
 * highlighted suggestion, or the typed text as a brand-new tag when nothing
 * is highlighted. Free entry always works, even if the tag list fails to
 * load (fail-soft).
 */
export function TagInput({ id, tags, onChange, getTags = getTagsDefault }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [availableTags, setAvailableTags] = useState<TagsResult["tags"]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listboxId = useId();

  useEffect(() => {
    let cancelled = false;
    getTags()
      .then((result) => {
        if (!cancelled) setAvailableTags(result.tags);
      })
      .catch(() => {
        // Fail soft: the tag list stays empty, free entry still works.
      });
    return () => {
      cancelled = true;
    };
  }, [getTags]);

  const suggestions = useMemo(() => {
    const query = normalize(draft.trim());
    if (query.length === 0) return [];
    const selected = new Set(tags.map(normalize));
    return availableTags
      .filter((tag) => !selected.has(normalize(tag.name)))
      .filter((tag) => normalize(tag.name).includes(query))
      .sort((a, b) => b.count - a.count);
  }, [draft, availableTags, tags]);

  function addTag(rawValue: string): void {
    const value = rawValue.trim();
    if (value.length === 0) return;
    const alreadySelected = tags.some((tag) => normalize(tag) === normalize(value));
    if (!alreadySelected) onChange([...tags, value]);
    setDraft("");
    setHighlightedIndex(-1);
  }

  function removeTag(tag: string): void {
    onChange(tags.filter((existing) => existing !== tag));
  }

  function commitDraft(): void {
    const highlighted = highlightedIndex >= 0 ? suggestions[highlightedIndex] : undefined;
    addTag(highlighted ? highlighted.name : draft);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (suggestions.length === 0) return;
      setHighlightedIndex((current) => (current + 1 >= suggestions.length ? 0 : current + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (suggestions.length === 0) return;
      setHighlightedIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
      return;
    }
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Tab") {
      if (draft.trim().length > 0 || highlightedIndex >= 0) commitDraft();
      return;
    }
    if (event.key === "Backspace" && draft.length === 0 && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  const activeOptionId =
    highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined;

  return (
    <div className="tag-input">
      <ul className="tag-input__chips">
        {tags.map((tag) => (
          <li key={tag} className="tag-input__chip">
            <span className="tag-input__chip-label">{tag}</span>
            <button
              type="button"
              className="tag-input__chip-remove"
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
            >
              ×
            </button>
          </li>
        ))}
        <li className="tag-input__field">
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            autoComplete="off"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
          />
        </li>
      </ul>

      {suggestions.length > 0 && (
        // ARIA listbox/option here follow the combobox aria-activedescendant
        // pattern: real DOM focus always stays on the input (see `role="combobox"`
        // above); options are only "virtually" focused via `aria-activedescendant`,
        // per the WAI-ARIA combobox authoring practice. `tabIndex={-1}` below makes
        // each option programmatically focusable (satisfying a11y tooling) without
        // adding it to the page's Tab order.
        <div id={listboxId} role="listbox" className="tag-input__suggestions">
          {suggestions.map((tag, index) => (
            <div
              key={tag.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              tabIndex={-1}
              aria-selected={index === highlightedIndex}
              className={
                index === highlightedIndex
                  ? "tag-input__suggestion tag-input__suggestion--active"
                  : "tag-input__suggestion"
              }
              // Use onMouseDown (fires before the input's blur) so clicking a
              // suggestion commits it instead of just blurring the field.
              onMouseDown={(event) => {
                event.preventDefault();
                addTag(tag.name);
              }}
            >
              <span>{tag.name}</span>
              <span className="tag-input__suggestion-count">{tag.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
