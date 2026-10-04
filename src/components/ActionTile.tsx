/**
 * ActionTile — a 64px-tall tile with an icon and label under it (TaskSheet's
 * Commit / Snooze / Due / Goal). `pressed` is the accent state; `badge`
 * replaces the icon (the committed slot number). Store-free.
 */
import type { JSX, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface ActionTileProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  /** Toggle state; omit for plain buttons. */
  pressed?: boolean;
  /** Accent state without toggle semantics (a value is set). */
  active?: boolean;
  badge?: ReactNode;
}

export function ActionTile({ icon, label, onClick, pressed, active, badge }: ActionTileProps): JSX.Element {
  const on = pressed || active;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] px-1 ${
        on ? "bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1px_var(--accent-line)]" : "bg-surface-2 text-ink"
      }`}
    >
      {badge != null ? <span className="font-serif text-[28px] leading-6">{badge}</span> : <Icon name={icon} size={24} />}
      <span className="max-w-full truncate text-[13px] font-medium">{label}</span>
    </button>
  );
}
