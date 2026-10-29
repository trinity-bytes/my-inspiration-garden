import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import "./IconButton.css";

export type IconButtonTone = "neutral" | "accent" | "danger";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  /** Lucide icon component, rendered at 20px. */
  icon: LucideIcon;
  /** Accessible name; also the tooltip text. */
  label: string;
  /** `accent` marks the one primary action of a surface, `danger` a destructive one. */
  tone?: IconButtonTone;
  /** Shows `label` as a tooltip on hover/focus. Set `false` when visible text already names it. */
  tooltip?: boolean;
  tooltipPlacement?: "bottom" | "top";
}

/**
 * Icon-only control (Figma Components `25:184`): a 36px circle in one of
 * three tones. Always named by `label`, which doubles as its tooltip.
 */
export function IconButton({
  icon: Icon,
  label,
  tone = "neutral",
  tooltip = true,
  tooltipPlacement = "bottom",
  className,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  const button = (
    <button
      {...buttonProps}
      type={type}
      aria-label={label}
      className={["icon-button", `icon-button--${tone}`, className].filter(Boolean).join(" ")}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );

  if (!tooltip) return button;

  return (
    <span className="icon-button-wrap has-tooltip">
      {button}
      <span
        className={tooltipPlacement === "top" ? "tooltip tooltip--top" : "tooltip"}
        aria-hidden="true"
      >
        {label}
      </span>
    </span>
  );
}
