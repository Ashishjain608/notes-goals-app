/**
 * slate.ts — pure day-slate logic (CONTEXT.md "Slate", docs/adr/0009,
 * docs/adr/0010). No store or IPC imports: whether a task belongs on today's
 * slate, and what committing/uncommitting one does, are pure functions of
 * (task, tasks, cap, day) — trivially testable and reusable from the store's
 * serialized task-mutation seam (store.ts's `mutateTask`).
 */

import type { IsoDate, Task } from "@/types";
import { localToday, toLocalDateKeyFromIso } from "@/lib/dates";

/**
 * How many tasks may sit on one day's slate. The cap IS the mechanism: a day
 * you can finish needs a small number of slots, and committing one more thing
 * than fits has to cost you something else. The user picks the number in
 * Settings (ADR-0010); it stays within these bounds so the slate stays small.
 */
export const DEFAULT_SLATE_CAP = 5;
export const MIN_SLATE_CAP = 1;
export const MAX_SLATE_CAP = 10;

/** Coerce any stored or typed value to a whole cap within the bounds. */
export function clampSlateCap(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SLATE_CAP;
  return Math.min(MAX_SLATE_CAP, Math.max(MIN_SLATE_CAP, Math.round(value)));
}

/**
 * True when this task is committed to the local day `day`. `committedOn` is
 * meant to hold a bare 'YYYY-MM-DD' (ADR-0009), but the compare normalizes
 * through `toLocalDateKeyFromIso` so a datetime-shaped value still compares
 * correctly rather than silently failing a string match.
 */
export function isOnSlate(task: Task, day: IsoDate): boolean {
  return task.committedOn != null && toLocalDateKeyFromIso(task.committedOn) === day;
}

export interface SlateSummary {
  /** Tasks committed to today, done ones included — what the cap counts. */
  count: number;
  /** Still to do. */
  openCount: number;
  /** Finished today, from the slate. */
  doneCount: number;
  /** True once every committed task is done: the day's finish line. */
  complete: boolean;
  /** True when no further task may be committed today. */
  full: boolean;
  /** The cap the slate was measured against. */
  cap: number;
}

/** The slate summary for `tasks` against `day`, at `cap`. Dropped tasks free their slot. */
function summarizeSlate(tasks: Task[], cap: number, day: IsoDate): SlateSummary {
  let openCount = 0;
  let doneCount = 0;

  for (const task of tasks) {
    if (task.status === "dropped" || !isOnSlate(task, day)) continue;
    if (task.status === "done") doneCount += 1;
    else openCount += 1;
  }

  const count = openCount + doneCount;
  return {
    count,
    openCount,
    doneCount,
    complete: openCount === 0 && doneCount > 0,
    full: count >= cap,
    cap,
  };
}

/**
 * The state of today's slate across ALL contexts. Global on purpose, and
 * deliberately NOT part of TodayView: the scarce thing is your hours, not your
 * office/personal split, so the cap and the finish line must not move when the
 * context filter does.
 */
export function selectSlate(
  tasks: Task[],
  cap: number = DEFAULT_SLATE_CAP,
  now: Date = new Date(),
): SlateSummary {
  return summarizeSlate(tasks, cap, localToday(now));
}

/** The effect of toggling a task's commitment: either its next shape, or why it was refused. */
export type CommitResult = { task: Task } | { rejected: "full" };

/**
 * Decide what committing/uncommitting `task` for `day` does, given the rest
 * of `tasks` and the chosen `cap` (docs/adr/0009, docs/adr/0010):
 * - already on the slate for `day` → uncommit (always allowed, even over cap).
 * - otherwise, slate full → reject.
 * - otherwise → commit to `day`; re-committing a task promised on an earlier
 *   day and not finished increments `carried` (the honest record, never a
 *   punishment).
 *
 * Pure: evaluate this against the LATEST task/tasks snapshot at the moment a
 * commit actually runs, never a stale one (store.ts's `mutateTask` does that).
 */
export function commitTransition(task: Task, tasks: Task[], cap: number, day: IsoDate): CommitResult {
  if (isOnSlate(task, day)) {
    return { task: { ...task, committedOn: null } };
  }

  if (summarizeSlate(tasks, cap, day).full) return { rejected: "full" };

  const priorDay = task.committedOn != null ? toLocalDateKeyFromIso(task.committedOn) : null;
  const carriedForward = priorDay != null && priorDay < day;

  return {
    task: {
      ...task,
      committedOn: day,
      carried: carriedForward ? task.carried + 1 : task.carried,
    },
  };
}
