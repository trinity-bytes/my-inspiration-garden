import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

export type ButtonVariant = "accent" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  /** Optional leading Lucide icon (20px at MD, 16px at SM). */
  icon?: LucideIcon;
}

/**
 * Button v2 (Figma Components `32:230`): a pill with an optional leading
 * icon. `accent` is the one primary action, `secondary` everything else,
 * `danger` a destructive confirmation.
 */
export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  className,
  type = "button",
  children,
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={["button", `button--${variant}`, `button--${size}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {Icon && <Icon size={size === "sm" ? 16 : 20} aria-hidden="true" />}
      {children}
    </button>
  );
}
