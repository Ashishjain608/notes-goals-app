/**
 * GoalRow — phone Goals-tab card (phone-final2 spec, GoalRow). Store-free:
 * context dot, title, target, "Next: …" and a 4px progress bar with "4/7".
 * `onHold` renders the transparent outlined variant with a grey fill.
 */
import type { JSX } from "react";
import type { Goal } from "@/types";
import { ContextDot } from "./ContextDot";
import { ProgressBar } from "./ProgressBar";
import { formatShortDate } from "@/lib/dates";

export interface GoalRowProps {
  goal: Goal;
  done: number;
  total: number;
  /** Title of the goal's next task, or null. */
  next: string | null;
  onOpen: (goalId: string) => void;
}

export function GoalRow({ goal, done, total, next, onOpen }: GoalRowProps): JSX.Element {
  const onHold = goal.status === "onhold";
  const target = formatShortDate(goal.target);
  return (
    <button
      type="button"
      onClick={() => onOpen(goal.id)}
      className={`flex w-full flex-col gap-2.5 rounded-2xl p-4 text-left ${
        onHold ? "bg-transparent shadow-[inset_0_0_0_1px_var(--line-2)]" : "bg-surface shadow-card"
      }`}
    >
      <span className="flex items-center gap-2">
        <ContextDot context={goal.context} />
        <span className={`min-w-0 flex-1 truncate text-[17px] font-semibold ${onHold ? "text-ink-2" : "text-ink"}`}>
          {goal.title}
        </span>
        {target && <span className="shrink-0 text-[13px] text-ink-2">by {target}</span>}
      </span>
      {next && (
        <span className="truncate text-[14px] text-ink-2">
          <span className="font-semibold text-ink">Next:</span> {next}
        </span>
      )}
      <span className="flex items-center gap-2.5">
        <span className={`flex-1 ${onHold ? "[&>div]:bg-line-2 [&>div>div]:bg-ink-3" : ""}`}>
          <ProgressBar value={done} total={total} height={4} />
        </span>
        <span className="text-[13px] tabular-nums text-ink-2">
          {done}/{total}
        </span>
      </span>
    </button>
  );
}
