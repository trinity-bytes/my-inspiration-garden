import { useCallback, useState } from "react";

export interface UseDisclosureResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/** Generic open/closed state for a disclosure widget (e.g. the Filters button). */
export function useDisclosure(initialOpen = false): UseDisclosureResult {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((current) => !current), []);

  return { isOpen, open, close, toggle };
}
