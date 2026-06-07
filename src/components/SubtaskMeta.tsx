/**
 * SubtaskMeta — a compact "done/total" indicator for a task's checklist.
 *
 * Renders nothing when the task has no subtasks. Uses tabular figures so the
 * count stays steady as subtasks complete.
 */
import type { JSX } from "react";
import type { Subtask } from "@/types";
import { Icon } from "./Icon";

export interface SubtaskMetaProps {
  subtasks: Subtask[];
}

/** Render the subtask progress count, or null when there are none. */
export function SubtaskMeta({ subtasks }: SubtaskMetaProps): JSX.Element | null {
  if (!subtasks.length) return null;
  const done = subtasks.filter((s) => s.status === "done").length;
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums text-ink-2">
      <Icon name="tasks" size={12} /> {done}/{subtasks.length}
    </span>
  );
}
