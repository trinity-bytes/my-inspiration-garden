import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseDialogFocusTrapResult {
  /** Wire to the dialog root's `onKeyDown` to keep Tab focus inside it. */
  handleTabKey: (event: React.KeyboardEvent) => void;
}

/**
 * Shared dialog accessibility behavior (T11): focuses the element marked
 * `data-autofocus` (else the first focusable element) on mount, restores focus to whatever was focused before on
 * unmount, closes on Escape, and traps Tab/Shift+Tab within the dialog.
 * Extracted from `ItemDetailModal` (T9) so the T11 quick-add/edit/history/
 * trash dialogs don't each re-implement it; `ItemDetailModal` itself is left
 * as-is to avoid touching already-shipped, tested behavior.
 */
export function useDialogFocusTrap(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): UseDialogFocusTrapResult {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dialogRef has stable identity (like a local useRef); must run once on mount only.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusTarget =
      dialog?.querySelector<HTMLElement>("[data-autofocus]") ??
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
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dialogRef has stable identity, see above.
  const handleTabKey = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
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
  }, []);

  return { handleTabKey };
}
