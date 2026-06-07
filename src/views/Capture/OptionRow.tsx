/**
 * OptionRow — the shared inline menu row used by the command palette and the
 * task-detail option popovers (due / snooze / goal).
 *
 * Purely presentational: it renders a full-width button with an optional leading
 * icon, a trailing sub-label or active checkmark, and a `danger` variant for
 * destructive choices (clear / unlink). Hover affordance is pure CSS.
 */
import type { JSX, ReactNode } from "react";
import type { IconName } from "@/components";
import { Icon } from "@/components";

export interface OptionRowProps {
  label: ReactNode;
  icon?: IconName;
  /** Trailing muted sub-label (e.g. the resolved context). */
  sub?: ReactNode;
  /** Renders a trailing accent checkmark when true. */
  active?: boolean;
  /** Styles the label in accent ink for destructive actions. */
  danger?: boolean;
  onClick?: () => void;
}

/** Render one selectable menu row. */
export function OptionRow({
  label,
  icon,
  sub,
  active = false,
  danger = false,
  onClick,
}: OptionRowProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[13.5px] transition-colors duration-100 hover:bg-raise ${
        danger ? "text-accent-ink" : "text-ink"
      }`}
    >
      {icon && (
        <span className="text-ink-3">
          <Icon name={icon} size={15} />
        </span>
      )}
      <span className="flex-1">{label}</span>
      {sub && <span className="text-xs text-ink-3">{sub}</span>}
      {active && (
        <span className="text-accent">
          <Icon name="check" size={14} />
        </span>
      )}
    </button>
  );
}
