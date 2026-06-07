/**
 * Aging model — the heart of the "the task is the source of truth" idea.
 *
 * A task's visual urgency grows with how many local days it has been open. This
 * ports computeAging() from the design prototype (ui.jsx) but returns Tailwind
 * CLASS names instead of inline CSS-variable colors, so rows stay theme-driven.
 *
 * Tones:  fresh (<3d) → muted ink-3,  aging (≥3d) → warn,  stale (≥7d) → accent.
 * Modes:  "subtle"     — muted label only (no tint, no bar).
 *         "noticeable" — toned label; faint accent tint when stale (v1 default).
 *         "escalating" — toned label + tint + a growing left bar (0–3px).
 */
import type { Task } from "@/types";
import { ageInDays } from "@/lib/dates";

export type AgingMode = "subtle" | "noticeable" | "escalating";

type Tone = "fresh" | "aging" | "stale";

export interface Aging {
  /** Whole local days the task has been open. */
  n: number;
  /** Compact label: "today" or "Nd". */
  label: string;
  /** Tailwind text-color class for the age label. */
  colorClass: string;
  /** Tailwind background class to tint the row, or null. */
  tintClass: string | null;
  /** Tailwind background class for the escalating left bar, or null. */
  barColorClass: string | null;
  /** Left-bar width in px (0–3); 0 when there is no bar. */
  barW: number;
}

function toneFor(n: number): Tone {
  if (n >= 7) return "stale";
  if (n >= 3) return "aging";
  return "fresh";
}

const LABEL_COLOR: Record<Tone, string> = {
  stale: "text-accent-ink",
  aging: "text-warn-ink",
  fresh: "text-ink-3",
};

const BAR_COLOR: Record<Tone, string> = {
  stale: "bg-accent",
  aging: "bg-warn-ink",
  fresh: "bg-line-2",
};

const TINT: Record<Tone, string | null> = {
  stale: "bg-accent-soft",
  aging: "bg-warn-soft",
  fresh: null,
};

/** Compute the visual aging cues for a task under the given mode. */
export function computeAging(task: Task, mode: AgingMode): Aging {
  const n = ageInDays(task.created);
  const label = n <= 0 ? "today" : `${n}d`;
  const tone = toneFor(n);

  if (mode === "subtle") {
    return { n, label, colorClass: "text-ink-3", tintClass: null, barColorClass: null, barW: 0 };
  }

  const colorClass = LABEL_COLOR[tone];

  if (mode === "escalating") {
    // A left bar that grows and deepens with age (0..3px).
    const barW = Math.min(3, Math.round(n / 4));
    return {
      n,
      label,
      colorClass,
      tintClass: TINT[tone],
      barColorClass: BAR_COLOR[tone],
      barW,
    };
  }

  // noticeable (default): toned label; faint accent tint only when stale.
  return {
    n,
    label,
    colorClass,
    tintClass: tone === "stale" ? "bg-accent-soft" : null,
    barColorClass: null,
    barW: 0,
  };
}
