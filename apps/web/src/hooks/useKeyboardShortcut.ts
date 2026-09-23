import { useEffect } from "react";

/**
 * Calls `onTrigger` when the user presses `Ctrl+<key>` (Windows/Linux) or
 * `Cmd+<key>` (macOS) anywhere in the document, preventing the browser's
 * default action (e.g. Cmd+K would otherwise focus the address bar in some
 * browsers). Ignores the key when pressed without either modifier, or with
 * both a different key.
 */
export function useKeyboardShortcut(key: string, onTrigger: () => void): void {
  useEffect(() => {
    const targetKey = key.toLowerCase();

    function handleKeyDown(event: KeyboardEvent): void {
      const hasModifier = event.ctrlKey || event.metaKey;
      if (!hasModifier) return;
      if (event.key.toLowerCase() !== targetKey) return;
      event.preventDefault();
      onTrigger();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [key, onTrigger]);
}
