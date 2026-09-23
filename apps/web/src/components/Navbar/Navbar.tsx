import { useRef, useState } from "react";
import { useDisclosure } from "../../hooks/useDisclosure";
import { useKeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import "./Navbar.css";
import { FiltersButton } from "./FiltersButton";
import { SearchInput } from "./SearchInput";

/**
 * Frosted-glass top navbar: brand wordmark, search (⌘K/Ctrl+K focuses it),
 * and a Filters stub that only toggles `aria-expanded` for now (T10 builds
 * the panel).
 */
export function Navbar() {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filters = useDisclosure();

  useKeyboardShortcut("k", () => {
    searchRef.current?.focus();
  });

  return (
    <header className="navbar">
      <h1 className="navbar__brand">Inspiration Garden</h1>
      <SearchInput ref={searchRef} value={query} onChange={setQuery} />
      <FiltersButton isOpen={filters.isOpen} onToggle={filters.toggle} />
    </header>
  );
}
