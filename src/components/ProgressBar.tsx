/**
 * ProgressBar — a thin accent-on-line bar showing value/total completion.
 *
 * Fills the width of its container; the caller sizes it via the surrounding
 * layout. The fill width is the one genuinely dynamic value, so it uses inline
 * style. Guards against a zero total (renders empty).
 */
import type { JSX } from "react";

export interface ProgressBarProps {
  value: number;
  total: number;
  /** Track height in px. Defaults to 5. */
  height?: number;
}

/** Render the completion bar. */
export function ProgressBar({ value, total, height = 5 }: ProgressBarProps): JSX.Element {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-line"
      style={{ height }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[cubic-bezier(.2,.7,.2,1)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
