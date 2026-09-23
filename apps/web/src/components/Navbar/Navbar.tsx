import { useRef, useState } from "react";
import { useDisclosure } from "../../hooks/useDisclosure";
import { useKeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import "./Navbar.css";
import { FiltersButton } from "./FiltersButton";
import { SearchInput } from "./SearchInput";

export interface NavbarProps {
  /** Shows a discreet "Sign out" link when true. No public sign-in button
   * is shown either way — the owner reaches `/auth/login` directly. */
  isOwner?: boolean;
}

/**
 * Frosted-glass top navbar: brand wordmark, search (⌘K/Ctrl+K focuses it),
 * a Filters stub that only toggles `aria-expanded` for now (T10 builds the
 * panel), and — for the owner only — a sign-out link.
 */
export function Navbar({ isOwner = false }: NavbarProps) {
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
      {isOwner && (
        <a className="navbar__signout" href="/cdn-cgi/access/logout">
          Sign out
        </a>
      )}
    </header>
  );
}
