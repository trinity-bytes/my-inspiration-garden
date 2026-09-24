import type { Item } from "@garden/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasEngine } from "../../canvas/engine";
import type { CardInstance } from "../../canvas/item-layout";
import type { GardenItemsStatus } from "../../items/useGardenItems";
import "./CanvasHost.css";

export interface CanvasHostProps {
  /** Fired once the canvas has drawn its first frame (or immediately, if WebGL is unavailable). */
  onReady?: () => void;
  /** Items rendered as cards on the canvas (T8b). */
  items?: Item[];
  itemsStatus?: GardenItemsStatus;
  /** Fired when a card is opened (clicked, or activated via the parallel DOM/ARIA layer). */
  onItemOpen?: (itemId: string) => void;
}

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

function cardAriaLabel(card: CardInstance): string {
  const title = card.item.title?.trim() || card.item.kind;
  return `${title} — ${card.item.kind}`;
}

/**
 * Full-viewport host for the T8 WebGL infinite canvas. Mounts a
 * `CanvasEngine` imperatively into `.canvas-host__webgl-target` — vanilla
 * three.js, not r3f; React only owns lifecycle here. The target div is the
 * focusable navigation region (arrow keys / WASD pan it while focused; see
 * `canvas/navigation-controller.ts`), so it carries `tabIndex=0` and an
 * accessible label instead of `aria-hidden`. Until (or unless) the engine
 * mounts, `CanvasHost.css` shows the tiled sky as a static CSS background.
 *
 * T8b adds: item cards (hover/click handled inside the engine via
 * hit-testing through the barrel distortion, see `canvas/hit-test.ts`), a
 * parallel DOM/ARIA card list (`.canvas-host__card-list`, visually hidden
 * — keyboard-focusable, mirrors whatever cards are currently visible;
 * focusing one pans the canvas to center it), and a subtle empty/error
 * message shown alongside the still-rendering sky.
 */
export function CanvasHost({
  onReady,
  items = [],
  itemsStatus = "loading",
  onItemOpen,
}: CanvasHostProps) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onItemOpenRef = useRef(onItemOpen);
  onItemOpenRef.current = onItemOpen;
  // Read once by the mount effect below (which intentionally only runs
  // once, like the rest of this component's engine lifecycle) — later
  // changes flow through the separate `setItems` effect instead of
  // recreating the whole engine.
  const initialItemsRef = useRef(items);

  const [visibleCards, setVisibleCards] = useState<CardInstance[]>([]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) {
      return;
    }
    // Set imperatively (rather than as a static JSX prop) so this
    // intentionally-focusable div — role="application" opts it into its own
    // keyboard model, arrow keys / WASD panning via NavigationController —
    // doesn't trip the generic "non-interactive element" a11y lint.
    target.tabIndex = 0;

    const engine = new CanvasEngine({
      reducedMotion: prefersReducedMotion(),
      items: initialItemsRef.current,
      onReady: () => onReadyRef.current?.(),
      // WebGL failures (unsupported, lost context, texture load errors) fall
      // back to the CSS sky background in CanvasHost.css; nothing to do here.
      onError: () => {},
      onItemOpen: (itemId) => onItemOpenRef.current?.(itemId),
      onVisibleCardsChange: (cards) => setVisibleCards(cards),
    });
    engineRef.current = engine;
    engine.mount(target);

    let motionQuery: MediaQueryList | null = null;
    const handleMotionChange = (event: MediaQueryListEvent) => {
      engine.setReducedMotion(event.matches);
    };
    if (typeof window.matchMedia === "function") {
      try {
        motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        motionQuery.addEventListener("change", handleMotionChange);
      } catch {
        motionQuery = null;
      }
    }

    return () => {
      motionQuery?.removeEventListener("change", handleMotionChange);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setItems(items);
  }, [items]);

  const handleCardFocus = useCallback((key: string) => {
    engineRef.current?.centerOnCardKey(key);
  }, []);

  const handleCardActivate = useCallback((itemId: string) => {
    onItemOpenRef.current?.(itemId);
  }, []);

  const showEmptyMessage = itemsStatus === "empty";
  const showErrorMessage = itemsStatus === "error";

  return (
    <div className="canvas-host" data-testid="canvas-host">
      <div
        ref={targetRef}
        className="canvas-host__webgl-target"
        role="application"
        aria-label="Inspiration garden canvas. Move the cursor, drag, or use arrow keys to look around."
      />
      {(showEmptyMessage || showErrorMessage) && (
        <p className="canvas-host__message" role="status">
          {showEmptyMessage
            ? "The garden is empty for now — nothing to show yet."
            : "Couldn't load the garden's items right now."}
        </p>
      )}
      <ul
        className="canvas-host__card-list visually-hidden"
        aria-label="Garden items currently in view"
      >
        {visibleCards.map((card) => (
          <li key={card.key}>
            <button
              type="button"
              onFocus={() => handleCardFocus(card.key)}
              onClick={() => handleCardActivate(card.item.id)}
            >
              {cardAriaLabel(card)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
