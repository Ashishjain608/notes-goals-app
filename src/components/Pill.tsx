/**
 * Pill — a rounded tab/filter button with an optional trailing count.
 *
 * Active reads as a raised surface chip (border + soft shadow); inactive is a
 * quiet ghost button. Used for status tabs and context/segmented filters.
 */
import type { JSX, ReactNode } from "react";

export interface PillProps {
  active?: boolean;
  count?: number;
  onClick?: () => void;
  children: ReactNode;
}

/** Render a pill/tab button. */
export function Pill({ active = false, count, onClick, children }: PillProps): JSX.Element {
  const tone = active
    ? "text-ink bg-surface border-line shadow-sm"
    : "text-ink-2 bg-transparent border-transparent";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-[13px] font-medium tracking-[-.005em] transition-all duration-150 ${tone}`}
    >
      {children}
      {count != null && (
        <span className="text-[11.5px] tabular-nums text-ink-3">{count}</span>
      )}
    </button>
  );
}
