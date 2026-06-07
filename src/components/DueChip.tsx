/**
 * DueChip — a calendar glyph + relative due label ("2d overdue", "Due today").
 *
 * Tone comes from dueLabel(): overdue reads in accent (bold), soon in warn, and
 * normal in muted ink. Renders nothing when the task has no due date.
 */
import type { JSX } from "react";
import type { IsoDate } from "@/types";
import { dueLabel } from "@/lib/dates";
import { Icon } from "./Icon";

export interface DueChipProps {
  due: IsoDate | null;
}

const TONE_COLOR = {
  overdue: "text-accent-ink",
  soon: "text-warn-ink",
  normal: "text-ink-2",
} as const;

/** Render the due-date chip, or null when there is no due date. */
export function DueChip({ due }: DueChipProps): JSX.Element | null {
  const d = dueLabel(due);
  if (!d) return null;
  const weight = d.tone === "overdue" ? "font-semibold" : "font-medium";
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-xs ${TONE_COLOR[d.tone]} ${weight}`}
    >
      <Icon name="calendar" size={12} /> {d.text}
    </span>
  );
}
