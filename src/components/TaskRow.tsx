/**
 * TaskRow — the canonical task row shared by Today, Backlog, and the Goal page.
 *
 * Renders the completion Checkbox, the title (struck through when done/dropped),
 * a meta line (ContextDot / DueChip / SubtaskMeta / GoalChip + a done/dropped
 * note), and the AgeTag. Applies the computeAging tint and escalating bar for
 * open tasks only. Purely presentational: it wires clicks to the supplied
 * callbacks and never touches a store.
 */
import type { JSX } from "react";
import type { Goal, Task } from "@/types";
import { computeAging, type AgingMode } from "./aging";
import { Checkbox } from "./Checkbox";
import { ContextDot } from "./ContextDot";
import { DueChip } from "./DueChip";
import { SubtaskMeta } from "./SubtaskMeta";
import { GoalChip } from "./GoalChip";
import { AgeTag } from "./AgeTag";

export interface TaskRowProps {
  task: Task;
  mode: AgingMode;
  /** Caller-resolved goal for the inline GoalChip. */
  goal?: Goal | null;
  showContext?: boolean;
  dense?: boolean;
  onToggle?: (id: string) => void;
  onOpen?: (id: string) => void;
  onOpenGoal?: (goalId: string) => void;
}

/** Render one task row. */
export function TaskRow({
  task,
  mode,
  goal,
  showContext = false,
  dense = false,
  onToggle,
  onOpen,
  onOpenGoal,
}: TaskRowProps): JSX.Element {
  const done = task.status === "done";
  const dropped = task.status === "dropped";
  const muted = done || dropped;
  const a = computeAging(task, mode);
  // Celebrate only a just-now completion, so done tasks don't animate on load/nav.
  const justCompleted =
    done && task.completed != null && Date.now() - new Date(task.completed).getTime() < 2500;

  // Tint only applies to open (non-muted) rows; hover always wins over the tint.
  const tint = !muted && a.tintClass ? a.tintClass : "bg-transparent";
  const padding = dense ? "py-2 pl-4 pr-3.5" : "py-[11px] pl-4 pr-3.5";
  const showBar = a.barW > 0 && !muted && a.barColorClass;

  return (
    <div
      onClick={() => onOpen?.(task.id)}
      className={`group relative flex cursor-pointer items-start gap-3 rounded-md transition-colors duration-150 hover:bg-raise ${tint} ${padding}`}
    >
      {showBar && (
        <span
          className={`absolute left-1 top-2 bottom-2 rounded-sm ${a.barColorClass}`}
          style={{ width: a.barW }}
        />
      )}

      <Checkbox
        checked={done}
        dropped={dropped}
        celebrate={justCompleted}
        onClick={() => onToggle?.(task.id)}
      />

      <div className="min-w-0 flex-1">
        <div
          className={`text-[14.5px] font-normal leading-[1.35] tracking-[-.005em] ${
            muted ? "text-ink-3 line-through decoration-ink-3" : "text-ink"
          }`}
        >
          {task.title}
        </div>

        <div
          className={`flex flex-wrap items-center gap-3 ${muted ? "mt-0 opacity-70" : "mt-[5px]"}`}
        >
          {showContext && <ContextDot context={task.context} />}
          {!muted && <DueChip due={task.due} />}
          {!muted && <SubtaskMeta subtasks={task.subtasks} />}
          {task.goalId && <GoalChip goal={goal} onOpen={onOpenGoal} />}
          {done && task.completed && <span className="text-xs text-ink-3">done</span>}
          {dropped && <span className="text-xs text-ink-3">dropped</span>}
        </div>
      </div>

      {!muted && (
        <div className="flex items-center gap-2.5 pt-px">
          <AgeTag task={task} mode={mode} />
        </div>
      )}
    </div>
  );
}
