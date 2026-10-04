/**
 * SlotMeter — one pill per slate slot, filled for each committed task (phone,
 * ADR-0012). Store-free and non-interactive: the 8px pills are never tap targets.
 */
import type { JSX } from "react";

export interface SlotMeterProps {
  cap: number;
  /** Committed tasks (done ones included, as the cap counts them). */
  filled: number;
  /** Trailing text, e.g. "2 open". */
  trailing?: string;
}

export function SlotMeter({ cap, filled, trailing }: SlotMeterProps): JSX.Element {
  return (
    <div role="img" aria-label={`${filled} of ${cap} slots committed`} className="mt-3.5 flex items-center gap-1.5">
      {Array.from({ length: cap }, (_, i) => (
        <span
          key={i}
          className={`h-2 max-w-11 min-w-3 flex-1 rounded-full ${i < filled ? "bg-accent" : "bg-ink-6"}`}
        />
      ))}
      {trailing && <span className="ml-1.5 shrink-0 text-[13px] text-ink-2">{trailing}</span>}
    </div>
  );
}
