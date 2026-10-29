import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import "./Select.css";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional leading Lucide icon for the row (and the trigger when selected). */
  icon?: LucideIcon;
}

export interface SelectProps<T extends string>
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange" | "children"> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /**
   * `field` is the Select v2 trigger; `icon` is a 36px icon button (pass
   * `icon` and an `aria-label`), e.g. "Move to…" in the category manager.
   */
  variant?: "field" | "icon";
  /** Leading icon of the trigger; defaults to the selected option's icon. */
  icon?: LucideIcon;
}

const GAP = 6;
const MAX_LIST_HEIGHT = 320;
/** Without the Popover API the list stays a plain fixed layer instead of hidden. */
const SUPPORTS_POPOVER =
  typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

/**
 * Select v2 (Figma Components `31:191`) with a Dropdown Menu list (`31:193`):
 * a select-only combobox per the WAI-ARIA APG. Focus stays on the trigger and
 * the active row is tracked with `aria-activedescendant`. The list opens in
 * the top layer (Popover API) at viewport coordinates, so the scrolling,
 * backdrop-filtered glass dialogs can neither clip nor offset it.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  variant = "field",
  icon,
  className,
  disabled,
  ...buttonProps
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({});
  const listId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const TriggerIcon = icon ?? selected?.icon;

  function open(index = selectedIndex) {
    setActiveIndex(index >= 0 ? index : 0);
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
  }

  function commit(index: number) {
    const option = options[index];
    close();
    if (option && option.value !== value) onChange(option.value);
  }

  useLayoutEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    if (SUPPORTS_POPOVER) list?.showPopover();

    function place() {
      const trigger = triggerRef.current;
      if (!trigger || !list) return;
      const rect = trigger.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - GAP * 2;
      const above = rect.top - GAP * 2;
      const height = Math.min(list.scrollHeight, MAX_LIST_HEIGHT);
      const openUp = height > below && above > below;
      setPosition({
        left: rect.left,
        minWidth: rect.width,
        maxHeight: Math.min(MAX_LIST_HEIGHT, openUp ? above : below),
        ...(openUp ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
      });
    }

    place();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [isOpen, activeIndex, listId]);

  /** Moves to the next option whose label starts with the typed character. */
  function typeahead(key: string): number | undefined {
    const start = (isOpen ? activeIndex : selectedIndex) + 1;
    for (let offset = 0; offset < options.length; offset++) {
      const index = (start + offset) % options.length;
      if (options[index]?.label.toLowerCase().startsWith(key.toLowerCase())) return index;
    }
    return undefined;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    const isChar = event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey;

    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        open();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        open(event.key === "Home" ? 0 : last);
      } else if (isChar) {
        const match = typeahead(event.key);
        if (match !== undefined) open(match);
      }
      return;
    }

    if (event.key === "Escape") {
      // Close only the list, not the dialog that listens on `document`.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key === "Tab") {
      commit(activeIndex);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (event.altKey) return commit(activeIndex);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => Math.min(last, Math.max(0, index + step)));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : last);
    } else if (isChar) {
      const match = typeahead(event.key);
      if (match !== undefined) setActiveIndex(match);
    }
  }

  return (
    <span
      className={["select", `select--${variant}`, className].filter(Boolean).join(" ")}
      ref={rootRef}
    >
      <button
        {...buttonProps}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={isOpen ? `${listId}-${activeIndex}` : undefined}
        disabled={disabled}
        className={variant === "icon" ? "icon-button icon-button--neutral" : "select__trigger"}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={onKeyDown}
      >
        {TriggerIcon && <TriggerIcon size={variant === "icon" ? 20 : 16} aria-hidden="true" />}
        {variant === "field" && (
          <>
            <span className="select__value">{selected?.label}</span>
            <ChevronDown className="select__chevron" size={16} aria-hidden="true" />
          </>
        )}
      </button>
      {isOpen && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard selection is handled on the focused trigger (aria-activedescendant).
        <div
          id={listId}
          ref={listRef}
          role="listbox"
          popover={SUPPORTS_POPOVER ? "manual" : undefined}
          tabIndex={-1}
          className="glass dropdown-menu select__list"
          style={position}
          // Keep focus on the trigger, and stop a wrapping <label> from
          // re-activating it after a row is chosen.
          onPointerDown={(event) => event.preventDefault()}
          onClick={(event) => event.preventDefault()}
        >
          {options.map((option, index) => {
            const OptionIcon = option.icon;
            const isSelected = index === selectedIndex;
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: see the listbox note above.
              <div
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                className={[
                  "dropdown-menu__item",
                  "select__option",
                  index === activeIndex && "select__option--active",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => {
                  commit(index);
                  triggerRef.current?.focus();
                }}
              >
                {OptionIcon && <OptionIcon size={20} aria-hidden="true" />}
                <span className="select__option-label">{option.label}</span>
                {isSelected && <Check className="select__check" size={16} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
