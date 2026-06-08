/**
 * Goals overview — a card grid of the goals the user is actively working toward,
 * with a collapsed "Closed" section for finished and dropped goals below it.
 *
 * Reads `goals`, `tasks`, and `contextFilter` from the store; splits the goals
 * via `selectGoalsOverview` (active + onhold → `live`, done + dropped → `closed`)
 * and computes each card's progress with `selectGoalProgress`. On-hold goals are
 * rendered in the grid but visually dimmed with an "On hold" tag. Clicking a card
 * navigates to that goal's page. Purely declarative: filtering, sorting, and
 * progress are the selectors' job; navigation is a store action.
 */
import { useMemo, useState, type JSX } from "react";
import type { Goal } from "@/types";
import { useStore, selectGoalsOverview, selectGoalProgress } from "@/store";
import { ProgressBar, ContextDot, Icon } from "@/components";
import { formatShortDate } from "@/lib/dates";
import { NewGoalDialog } from "./NewGoalDialog";

/* ----------------------------------------------------------------- live cards */

interface GoalCardProps {
  goal: Goal;
  done: number;
  total: number;
  onOpen: (goalId: string) => void;
}

/** One goal card: context + target meta, serif title, clamped description, and
 *  a live progress bar with a done/total count. Lifts on hover. */
function GoalCard({ goal, done, total, onOpen }: GoalCardProps): JSX.Element {
  const onHold = goal.status === "onhold";
  const target = formatShortDate(goal.target);

  return (
    <button
      type="button"
      onClick={() => onOpen(goal.id)}
      className={`group flex flex-col rounded-xl border border-line bg-surface p-5 text-left shadow-sm transition-[transform,box-shadow,opacity] duration-150 hover:-translate-y-0.5 hover:shadow ${
        onHold ? "opacity-60 hover:opacity-100" : ""
      }`}
    >
      <div className="mb-2.5 flex items-center gap-[7px] text-xs text-ink-2">
        <ContextDot context={goal.context} />
        <span>{goal.context}</span>
        {target && (
          <>
            <span className="text-ink-3">·</span>
            <span>by {target}</span>
          </>
        )}
        {onHold && (
          <span className="ml-auto rounded-full bg-surface-2 px-[9px] py-[2px] text-[11px] font-medium text-ink-3">
            On hold
          </span>
        )}
      </div>

      <div className="mb-2 font-serif text-[21px] font-medium leading-[1.15] tracking-[-.01em] text-ink">
        {goal.title}
      </div>

      <p className="mb-4 line-clamp-2 text-[13.5px] leading-[1.5] text-ink-2">
        {goal.description}
      </p>

      <div className="mt-auto flex items-center gap-2.5">
        <ProgressBar value={done} total={total} />
        <span className="whitespace-nowrap text-[12.5px] tabular-nums text-ink-2">
          {done}/{total}
        </span>
      </div>
    </button>
  );
}

/* --------------------------------------------------------------- closed list */

/** Tag shown beside a closed goal's title. */
function ClosedTag({ status }: { status: Goal["status"] }): JSX.Element {
  const label = status === "done" ? "done" : "dropped";
  return (
    <span className="rounded-full bg-surface-2 px-[9px] py-[2px] text-[11px] font-medium text-ink-3">
      {label}
    </span>
  );
}

interface ClosedSectionProps {
  closed: Goal[];
  onOpen: (goalId: string) => void;
}

/** Collapsed-by-default section listing done + dropped goals as a simple list. */
function ClosedSection({ closed, onOpen }: ClosedSectionProps): JSX.Element | null {
  const [open, setOpen] = useState(false);

  if (closed.length === 0) return null;

  return (
    <section className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.07em] text-ink-3 transition-colors hover:text-ink-2"
      >
        <Icon
          name="chevron"
          size={13}
          className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        Closed
        <span className="tabular-nums">{closed.length}</span>
      </button>

      {open && (
        <ul className="mt-3 flex flex-col gap-px">
          {closed.map((goal) => (
            <li key={goal.id}>
              <button
                type="button"
                onClick={() => onOpen(goal.id)}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-raise"
              >
                <ContextDot context={goal.context} />
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2">
                  {goal.title}
                </span>
                <ClosedTag status={goal.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ the view */

/** Goals overview: header, a 2-column grid of live goals, then Closed. */
export default function GoalsOverview(): JSX.Element {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const contextFilter = useStore((s) => s.contextFilter);
  const navigate = useStore((s) => s.navigate);

  const [adding, setAdding] = useState(false);

  const { live, closed } = useMemo(
    () => selectGoalsOverview(goals, contextFilter),
    [goals, contextFilter],
  );

  const openGoal = (goalId: string): void => navigate("goal", goalId);

  return (
    <div className="scroll h-full pt-10 pb-[120px]">
      <div className="mx-auto max-w-[760px] px-10">
        <header className="mb-[26px] flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[.1em] text-accent-ink">
              Goals
            </div>
            <h1 className="m-0 font-serif text-[32px] font-normal tracking-[-.01em] text-ink">
              What I&apos;m working toward
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-2 shadow-sm transition-colors duration-150 hover:text-ink"
          >
            <Icon name="plus" size={16} />
            New goal
          </button>
        </header>

        {live.length === 0 ? (
          <p className="py-[50px] text-center italic text-ink-3">
            No active goals in this context yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {live.map((goal) => {
              const { done, total } = selectGoalProgress(goal.id, tasks);
              return (
                <GoalCard key={goal.id} goal={goal} done={done} total={total} onOpen={openGoal} />
              );
            })}
          </div>
        )}

        <ClosedSection closed={closed} onOpen={openGoal} />
      </div>
      <NewGoalDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
