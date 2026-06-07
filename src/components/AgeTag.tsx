/**
 * AgeTag — the small "Nd" label showing how long a task has been open.
 *
 * Color and weight escalate with age via computeAging; stale tasks (≥7d) read
 * bolder. Uses tabular figures so the column stays aligned across rows.
 */
import type { JSX } from "react";
import type { Task } from "@/types";
import { computeAging, type AgingMode } from "./aging";

export interface AgeTagProps {
  task: Task;
  mode: AgingMode;
}

/** Render the age label for a task. */
export function AgeTag({ task, mode }: AgeTagProps): JSX.Element {
  const a = computeAging(task, mode);
  const weight = a.n >= 7 ? "font-semibold" : "font-medium";
  return (
    <span
      title={`Open ${a.n} day${a.n === 1 ? "" : "s"}`}
      className={`whitespace-nowrap text-xs tabular-nums tracking-[.01em] ${a.colorClass} ${weight}`}
    >
      {a.label}
    </span>
  );
}
