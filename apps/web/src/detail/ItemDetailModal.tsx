import type { Item } from "@garden/shared";
import { normalizePalette } from "@garden/shared";
import { ExternalLink, History, Pencil, StickyNote, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveMediaRef } from "../api/media-ref";
import { contrastTextColor } from "../color-contrast";
import { ConfirmDialog } from "../components/Dialog/ConfirmDialog";
import { IconButton } from "../components/IconButton/IconButton";
import { useLoadedFontFamily } from "./useLoadedFontFamily";
import "../components/Button/Button.css";
import "./ItemDetailModal.css";

export interface ItemDetailModalProps {
  item: Item;
  onClose: () => void;
  /** `categoryIds` -> display name, resolved by the caller (this modal only reads names it's given). A missing id falls back to showing the raw id (the API's item detail response only carries `categoryIds`, not names). */
  categoryNames: Record<string, string>;
  /** Shows the owner-only action row (Edit/History/Move to trash) when true. Defaults to false (visitor view). */
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

function PaletteSwatches({
  colors,
}: {
  colors: { hex: string; name?: string; weight?: number }[];
}) {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Normalized once for the whole palette: weights always sum to
  // 1, so each swatch's size and shown percentage stay proportional and
  // consistent with the canvas card's bands (`paletteCardContent`) and the
  // API's `item_colors` indexing (`deriveItemColors`) — all three go through
  // this same shared `normalizePalette`.
  const normalized = normalizePalette(colors);

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
      {normalized.map((color) => (
        <li key={color.hex} style={{ flexBasis: `${(color.weight * 100).toFixed(2)}%` }}>
          <button
            type="button"
            className="item-detail__swatch"
            style={{ backgroundColor: color.hex, color: contrastTextColor(color.hex) }}
            onClick={() => handleCopy(color.hex)}
          >
            <span className="item-detail__swatch-hex">{color.hex}</span>
            {color.name && <span className="item-detail__swatch-name">{color.name}</span>}
            <span className="item-detail__swatch-weight">{Math.round(color.weight * 100)}%</span>
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

/**
 * A preview image that opens the item's URL, marked by an "Open" badge so it
 * reads as clickable. Kept out of the tab order: the "Open link" button right
 * below is the same link for keyboard users.
 */
function PreviewLink({ href, src }: { href: string; src: string }) {
  return (
    <a
      className="item-detail__preview-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={-1}
    >
      <img className="item-detail__link-preview" src={src} alt="" />
      <span className="item-detail__open-badge">
        <ExternalLink size={14} aria-hidden="true" />
        Open
      </span>
    </a>
  );
}

function ItemDetailBody({ item }: { item: Item }) {
  // Direct MP4 links need a native player, not an iframe or an image preview.
  let directVideoUrl: string | undefined;
  if ((item.kind === "link" || item.kind === "video") && item.url) {
    try {
      const url = new URL(item.url);
      if (/^https?:$/.test(url.protocol) && /\.mp4$/i.test(url.pathname)) {
        directVideoUrl = item.url;
      }
    } catch {
      // Preserve the existing fallback for unrecognized URLs.
    }
  }
  if (item.kind === "video" && item.data.provider === "file" && item.data.r2Key) {
    directVideoUrl = resolveMediaRef(item.data.r2Key);
  }
  if (directVideoUrl) {
    return (
      <div className="item-detail__link">
        <div className="item-detail__media item-detail__media--video">
          {/* biome-ignore lint/a11y/useMediaCaption: External MP4 items do not provide caption tracks; do not invent captions. */}
          <video
            src={directVideoUrl}
            aria-label={item.title?.trim() || "Video"}
            controls
            playsInline
            preload="metadata"
          />
        </div>
        {item.kind === "link" && item.data.description && (
          <p className="item-detail__description">{item.data.description}</p>
        )}
        <a
          className="button button--accent item-detail__open-link"
          href={directVideoUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open link ↗
        </a>
      </div>
    );
  }
  switch (item.kind) {
    case "image":
      return (
        <>
          <div className="item-detail__media item-detail__media--image">
            <img
              src={`/api/media/${item.data.r2Key}`}
              alt={item.title?.trim() || item.data.alt || "Image"}
            />
          </div>
          {item.data.description && (
            <p className="item-detail__description">{item.data.description}</p>
          )}
        </>
      );
    case "link":
      return (
        <div className="item-detail__link">
          {item.data.previewImage && (
            <PreviewLink href={item.url} src={resolveMediaRef(item.data.previewImage)} />
          )}
          {item.data.description && (
            <p className="item-detail__description">{item.data.description}</p>
          )}
          <p className="item-detail__domain">{new URL(item.url).hostname.replace(/^www\./, "")}</p>
          <a
            className="button button--accent item-detail__open-link"
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
          {item.data.thumbnail &&
            (item.url ? (
              <PreviewLink href={item.url} src={item.data.thumbnail} />
            ) : (
              <img className="item-detail__link-preview" src={item.data.thumbnail} alt="" />
            ))}
          {item.url && (
            <a
              className="button button--accent item-detail__open-link"
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
 * Solid cartoon-style modal overlay showing an item's full detail.
 * `role="dialog"` + `aria-modal`, labelled by the item's title; traps Tab
 * focus within itself, closes on Esc or a backdrop click, and returns
 * focus to whatever was focused before it opened. Owner-only editing:
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
    // Close first, not the first header button: landing on Edit or Move to
    // trash would make an accidental Enter destructive.
    const focusTarget =
      dialog?.querySelector<HTMLElement>(".item-detail__close") ??
      dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      dialog ??
      undefined;
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
      className="item-detail-backdrop sheet-backdrop"
      data-testid="detail-modal-backdrop"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="glass item-detail-dialog sheet--full"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-reduced-motion={reducedMotion ? "true" : "false"}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleTabKey}
      >
        <div className="item-detail__header">
          {isOwner && onEdit && <IconButton icon={Pencil} label="Edit" onClick={onEdit} />}
          {isOwner && onOpenHistory && (
            <IconButton icon={History} label="History" onClick={onOpenHistory} />
          )}
          <span className="item-detail__header-push" />
          {isOwner && onDelete && (
            <IconButton
              icon={Trash2}
              label="Move to trash"
              tone="danger"
              tooltipAlign="end"
              onClick={() => setConfirmingDelete(true)}
            />
          )}
          <IconButton
            icon={X}
            label="Close"
            className="item-detail__close"
            tooltipAlign="end"
            onClick={onClose}
          />
        </div>

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

        {item.notes && (
          <div className="item-detail__note" role="note" aria-label="Note">
            <StickyNote size={16} aria-hidden="true" />
            <p>{item.notes}</p>
          </div>
        )}

        {item.tags.length > 0 && (
          <ul className="item-detail__tags" aria-label="Tags">
            {item.tags.map((tag) => (
              <li key={tag} className="chip chip--static">
                <span aria-hidden="true">#</span>
                {tag}
              </li>
            ))}
          </ul>
        )}

        {categoryLabels.length > 0 && (
          <ul className="item-detail__categories" aria-label="Categories">
            {categoryLabels.map((label) => (
              <li key={label} className="chip chip--static">
                {label}
              </li>
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
