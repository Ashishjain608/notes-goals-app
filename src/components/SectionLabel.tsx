/**
 * SectionLabel — a small uppercase header for a list group (e.g. "Office", a
 * status section, "Completed today"), with an optional trailing count.
 *
 * `accent` tints the label in the accent ink for sections that need emphasis.
 */
import type { JSX, ReactNode } from "react";

export interface SectionLabelProps {
  children: ReactNode;
  count?: number;
  accent?: boolean;
}

/** Render a section header label. */
export function SectionLabel({ children, count, accent = false }: SectionLabelProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-[11px] font-semibold uppercase tracking-[.08em] ${
          accent ? "text-accent-ink" : "text-ink-3"
        }`}
      >
        {children}
      </span>
      {count != null && <span className="text-[11px] tabular-nums text-ink-3">{count}</span>}
    </div>
  );
}
