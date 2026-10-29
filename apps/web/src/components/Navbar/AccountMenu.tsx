import { CircleUserRound, type LucideIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { useDisclosure } from "../../hooks/useDisclosure";
import { IconButton } from "../IconButton/IconButton";

export interface AccountMenuAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

export interface AccountMenuProps {
  actions: AccountMenuAction[];
  signOutHref: string;
  signOutIcon: LucideIcon;
}

/**
 * Account menu for the phone navbar (Figma Proposals `26:567`): the owner's
 * management actions, then Sign out last after a divider. A person icon,
 * not ☰, so it never reads like the Filters (sliders) control.
 */
export function AccountMenu({ actions, signOutHref, signOutIcon: SignOutIcon }: AccountMenuProps) {
  const menu = useDisclosure();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isOpen, close } = menu;

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen, close]);

  function closeAndRefocus() {
    close();
    rootRef.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRefocus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      close();
    }
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <IconButton
        icon={CircleUserRound}
        label="Account menu"
        tooltip={false}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={menu.toggle}
      />
      {isOpen && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="glass dropdown-menu account-menu__list"
          onKeyDown={onMenuKeyDown}
        >
          {actions.map(({ label, icon: Icon, onSelect }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className="dropdown-menu__item"
              onClick={() => {
                close();
                onSelect();
              }}
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </button>
          ))}
          <hr className="dropdown-menu__separator" />
          <a role="menuitem" className="dropdown-menu__item" href={signOutHref}>
            <SignOutIcon size={20} aria-hidden="true" />
            Sign out
          </a>
        </div>
      )}
    </div>
  );
}
