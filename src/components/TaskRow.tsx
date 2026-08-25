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
import { Icon } from "./Icon";

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
  /** When provided, the trailing flag becomes a quick priority toggle. */
  onTogglePriority?: (id: string) => void;
  /** True when this task sits on today's slate. */
  committed?: boolean;
  /** True when the slate is full — committing anything new is refused. */
  slateFull?: boolean;
  /** When provided, the row gains a commit-to-today toggle. */
  onToggleCommit?: (id: string) => void;
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
  onTogglePriority,
  committed = false,
  slateFull = false,
  onToggleCommit,
}: TaskRowProps): JSX.Element {
  const done = task.status === "done";
  const dropped = task.status === "dropped";
  const muted = done || dropped;
  const a = computeAging(task, mode);
  // Celebrate only a just-now completion, so done tasks don't animate on load/nav.
  const justCompleted =
    done && task.completed != null && Date.now() - new Date(task.completed).getTime() < 2500;

  // Tint only applies to open (non-muted) rows; hover always wins over the tint.
  // A priority flag highlights the row in accent, overriding the aging tint.
  const tint =
    !muted && task.priority
      ? "bg-accent-soft"
      : !muted && a.tintClass
        ? a.tintClass
        : "bg-transparent";
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
          {!muted && task.carried > 0 && (
            <span
              className="text-xs text-warn-ink"
              title={`Committed and not finished on ${task.carried} earlier ${
                task.carried === 1 ? "day" : "days"
              }`}
            >
              carried {task.carried}×
            </span>
          )}
          {done && task.completed && <span className="text-xs text-ink-3">done</span>}
          {dropped && <span className="text-xs text-ink-3">dropped</span>}
        </div>
      </div>

      {!muted && (
        <div className="flex items-center gap-2 pt-px">
          {onToggleCommit && (
            <button
              type="button"
              disabled={!committed && slateFull}
              aria-label={committed ? "Take off today's slate" : "Commit to today"}
              title={
                committed
                  ? "Take off today's slate"
                  : slateFull
                    ? "Today's slate is full — finish or free a slot first"
                    : "Commit to today"
              }
              onClick={(e) => {
                e.stopPropagation();
                onToggleCommit(task.id);
              }}
              className={`rounded p-0.5 transition-all duration-150 ${
                committed
                  ? "text-accent"
                  : slateFull
                    ? "text-ink-3 opacity-0 group-hover:opacity-40"
                    : "text-ink-3 opacity-0 hover:text-accent group-hover:opacity-100"
              }`}
            >
              <Icon name="today" size={14} />
            </button>
          )}
          {onTogglePriority ? (
            <button
              type="button"
              aria-label={task.priority ? "Remove priority" : "Mark as priority"}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePriority(task.id);
              }}
              className={`rounded p-0.5 transition-all duration-150 ${
                task.priority
                  ? "text-accent"
                  : "text-ink-3 opacity-0 hover:text-accent group-hover:opacity-100"
              }`}
            >
              <Icon name="flag" size={14} />
            </button>
          ) : (
            task.priority && (
              <span className="text-accent">
                <Icon name="flag" size={14} />
              </span>
            )
          )}
          <AgeTag task={task} mode={mode} />
        </div>
      )}
    </div>
  );
}
