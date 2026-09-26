import type { Item } from "@garden/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { contrastTextColor } from "../color-contrast";
import { ConfirmDialog } from "../components/Dialog/ConfirmDialog";
import { useLoadedFontFamily } from "./useLoadedFontFamily";
import "./ItemDetailModal.css";

export interface ItemDetailModalProps {
  item: Item;
  onClose: () => void;
  /** `categoryIds` -> display name, resolved by the caller (T10 owns the full category tree UI — this modal only reads names it's given). A missing id falls back to showing the raw id (documented gap: the API's item detail response only carries `categoryIds`, not names). */
  categoryNames: Record<string, string>;
  /** T11: shows the owner-only action row (Edit/History/Move to trash) when true. Defaults to false (visitor view, unchanged from T9). */
  isOwner?: boolean;
  onEdit?: () => void;
  onOpenHistory?: () => void;
  onDelete?: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function formatCreatedDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

const KIND_LABELS: Record<Item["kind"], string> = {
  image: "Image",
  link: "Link",
  text: "Text",
  video: "Video",
  palette: "Palette",
  font: "Font",
};

function PaletteSwatches({ colors }: { colors: { hex: string; name?: string }[] }) {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback((hex: string) => {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    const done = () => {
      setCopiedHex(hex);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiedHex(null), 1800);
    };
    if (clipboard?.writeText) {
      clipboard.writeText(hex).then(done, done);
    } else {
      done();
    }
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return (
    <ul className="item-detail__palette-grid">
      {colors.map((color) => (
        <li key={color.hex}>
          <button
            type="button"
            className="item-detail__swatch"
            style={{ backgroundColor: color.hex, color: contrastTextColor(color.hex) }}
            onClick={() => handleCopy(color.hex)}
          >
            <span className="item-detail__swatch-hex">{color.hex}</span>
            {color.name && <span className="item-detail__swatch-name">{color.name}</span>}
            {copiedHex === color.hex && (
              <span className="item-detail__swatch-copied" role="status">
                Copied!
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function FontSpecimen({ item }: { item: Extract<Item, { kind: "font" }> }) {
  const { fontFamily } = useLoadedFontFamily(
    item.data.family,
    item.data.sourceUrl,
    "Geist Variable",
  );
  const style = { fontFamily: `"${fontFamily}", "Geist Variable", system-ui, sans-serif` };

  return (
    <div className="item-detail__font-specimen">
      <p className="item-detail__font-family">{item.data.family}</p>
      {[0.9, 1.6, 2.6].map((scale) => (
        <p
          key={scale}
          className="item-detail__font-sample"
          style={{ ...style, fontSize: `${scale * 1.5}rem` }}
        >
          Aa
        </p>
      ))}
      <p className="item-detail__font-pangram" style={style}>
        {item.data.previewText?.trim() || "The quick brown fox jumps over the lazy dog"}
      </p>
    </div>
  );
}

function ItemDetailBody({ item }: { item: Item }) {
  switch (item.kind) {
    case "image":
      return (
        <div className="item-detail__media item-detail__media--image">
          <img
            src={`/api/media/${item.data.r2Key}`}
            alt={item.title?.trim() || item.data.alt || "Image"}
          />
        </div>
      );
    case "link":
      return (
        <div className="item-detail__link">
          {item.data.previewImage && (
            <img
              className="item-detail__link-preview"
              src={item.data.previewImage}
              alt=""
              aria-hidden="true"
            />
          )}
          {item.data.description && (
            <p className="item-detail__description">{item.data.description}</p>
          )}
          <p className="item-detail__domain">{new URL(item.url).hostname.replace(/^www\./, "")}</p>
          <a
            className="item-detail__open-link"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open link ↗
          </a>
        </div>
      );
    case "video":
      return item.data.embedUrl ? (
        <div className="item-detail__media item-detail__media--video">
          <iframe
            title={item.title?.trim() || "Video"}
            src={item.data.embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="item-detail__link">
          {item.data.thumbnail && (
            <img
              className="item-detail__link-preview"
              src={item.data.thumbnail}
              alt=""
              aria-hidden="true"
            />
          )}
          {item.url && (
            <a
              className="item-detail__open-link"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open link ↗
            </a>
          )}
        </div>
      );
    case "text":
      return <p className="item-detail__body-text">{item.data.body}</p>;
    case "palette":
      return <PaletteSwatches colors={item.data.colors} />;
    case "font":
      return <FontSpecimen item={item} />;
  }
}

/**
 * Frosted-glass modal overlay showing an item's full detail (T9 scope B).
 * `role="dialog"` + `aria-modal`, labelled by the item's title; traps Tab
 * focus within itself, closes on Esc or a backdrop click, and returns
 * focus to whatever was focused before it opened. Owner-only editing (T11):
 * when `isOwner` is true, an Edit/History/Move to trash action row appears;
 * each button only renders once its callback prop is provided, so partial
 * wiring degrades gracefully instead of throwing.
 */
export function ItemDetailModal({
  item,
  onClose,
  categoryNames,
  isOwner = false,
  onEdit,
  onOpenHistory,
  onDelete,
}: ItemDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = `item-detail-title-${item.id}`;
  const reducedMotion = prefersReducedMotion();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusTarget =
      dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? dialog ?? undefined;
    focusTarget?.focus();

    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // While the confirm-delete dialog is open, it owns Escape (see its own
      // useDialogFocusTrap) — this modal must not also close underneath it.
      if (event.key === "Escape" && !confirmingDelete) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, confirmingDelete]);

  const handleTabKey = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Tab") return;
      // The nested confirm dialog owns its own Tab trap while open.
      if (confirmingDelete) return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    },
    [confirmingDelete],
  );

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const title = item.title?.trim() || KIND_LABELS[item.kind];
  const categoryLabels = item.categoryIds.map((id) => categoryNames[id] ?? id);

  return (
    // Backdrop click-to-close is a mouse-only convenience with a fully
    // equivalent keyboard path already present (Escape, handled above, and
    // the visible Close button below) — WCAG 2.1.1 only requires SOME
    // keyboard-operable equivalent to exist, not that every mouse handler
    // duplicate it. A <button> here would be invalid HTML (it would nest
    // the dialog's own links/buttons inside it, which browsers don't
    // support), so this stays a plain, non-interactive-role backdrop div.
    // biome-ignore lint/a11y/noStaticElementInteractions: see comment above.
    // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
    <div
      className="item-detail-backdrop"
      data-testid="detail-modal-backdrop"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="item-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-reduced-motion={reducedMotion ? "true" : "false"}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleTabKey}
      >
        <button type="button" className="item-detail__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {isOwner && (onEdit || onOpenHistory || onDelete) && (
          <div className="item-detail__owner-actions">
            {onEdit && (
              <button type="button" onClick={onEdit}>
                Edit
              </button>
            )}
            {onOpenHistory && (
              <button type="button" onClick={onOpenHistory}>
                History
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={() => setConfirmingDelete(true)}>
                Move to trash
              </button>
            )}
          </div>
        )}

        {confirmingDelete && onDelete && (
          <ConfirmDialog
            title="Move to trash?"
            message="This item will be moved to the trash. You can restore it later."
            confirmLabel="Move to trash"
            destructive
            onConfirm={() => {
              setConfirmingDelete(false);
              onDelete();
            }}
            onCancel={() => setConfirmingDelete(false)}
          />
        )}

        <span className="item-detail__kind-label">{KIND_LABELS[item.kind]}</span>
        <h2 id={titleId} className="item-detail__title">
          {title}
        </h2>

        <div className="item-detail__content">
          <ItemDetailBody item={item} />
        </div>

        {item.tags.length > 0 && (
          <ul className="item-detail__tags" aria-label="Tags">
            {item.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}

        {categoryLabels.length > 0 && (
          <ul className="item-detail__categories" aria-label="Categories">
            {categoryLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        )}

        <dl className="item-detail__meta">
          <dt>Added</dt>
          <dd>{formatCreatedDate(item.createdAt)}</dd>
          <dt>Source</dt>
          <dd>{item.source}</dd>
        </dl>
      </div>
    </div>
  );
}
