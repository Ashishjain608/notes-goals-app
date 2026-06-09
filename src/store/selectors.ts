/**
 * Pure selectors — the live "queries" that turn the loaded entity graph into
 * the shapes each view renders. Every selector is a pure function of state
 * slices (no store, no IPC, no Date.now() except via an injectable `now`), so
 * they are trivially testable and reusable.
 *
 * Domain rules honored here come from docs/adr/0002 (goal status never
 * cascades; progress is computed), docs/adr/0004 (local-day Today semantics),
 * and docs/IMPLEMENTATION_PLAN.md §6.
 */

import type { ContextFilter, Goal, IsoDate, Note, Task, TaskStatus } from "@/types";
import { ageInDays, isCompletedToday, isSnoozed, toLocalDateKeyFromIso } from "@/lib/dates";

/* ---------------------------------------------------------------- utilities */

/** Does this entity's context pass the global filter? `all` accepts everything. */
function matchesFilter(context: Task["context"], filter: ContextFilter): boolean {
  return filter === "all" || context === filter;
}

/** Ascending by `created` (oldest first). Stable for equal timestamps. */
function byCreatedAsc(a: { created: string }, b: { created: string }): number {
  if (a.created < b.created) return -1;
  if (a.created > b.created) return 1;
  return 0;
}

/* -------------------------------------------------------------- goal lookup */

/** Index goals by id for O(1) resolution from tasks/notes. */
export function goalsById(goals: Goal[]): Record<string, Goal> {
  const map: Record<string, Goal> = {};
  for (const goal of goals) map[goal.id] = goal;
  return map;
}

/* -------------------------------------------------------------------- TODAY */

export interface TodayView {
  office: Task[];
  personal: Task[];
  completedToday: Task[];
  openCount: number;
  oldestAgeDays: number;
}

/**
 * Today (ADR-0004): open + un-snoozed tasks within the filter, grouped by
 * context and sorted oldest-`created` first; plus tasks marked done today
 * (tucked at the bottom). A task dropped today is excluded — only done-today
 * keeps a courtesy slot. `openCount` counts the visible open tasks;
 * `oldestAgeDays` is the largest age among them (0 when none).
 */
export function selectToday(tasks: Task[], filter: ContextFilter, now: Date = new Date()): TodayView {
  const office: Task[] = [];
  const personal: Task[] = [];
  const completedToday: Task[] = [];

  for (const task of tasks) {
    if (!matchesFilter(task.context, filter)) continue;

    if (task.status === "open" && !isSnoozed(task.snoozeUntil, now)) {
      if (task.context === "office") office.push(task);
      else personal.push(task);
    } else if (task.status === "done" && isCompletedToday(task.completed, now)) {
      completedToday.push(task);
    }
  }

  office.sort(byCreatedAsc);
  personal.sort(byCreatedAsc);
  completedToday.sort(byCreatedAsc);

  const open = [...office, ...personal];
  const oldestAgeDays = open.reduce(
    (oldest, task) => Math.max(oldest, ageInDays(task.created, now)),
    0,
  );

  return {
    office,
    personal,
    completedToday,
    openCount: open.length,
    oldestAgeDays,
  };
}

/* ------------------------------------------------------------------ BACKLOG */

export interface BacklogFilters {
  status: TaskStatus | "all";
  chip: "due" | "snoozed" | "goal" | null;
  query: string;
}

/**
 * Backlog / All Tasks: status tab + optional chip (has-due / currently-snoozed
 * / linked-to-goal) + case-insensitive title substring. Sorted oldest-`created`
 * first. The context filter applies across the board.
 */
export function selectBacklog(
  tasks: Task[],
  filter: ContextFilter,
  f: BacklogFilters,
  now: Date = new Date(),
): Task[] {
  const needle = f.query.trim().toLowerCase();

  const result = tasks.filter((task) => {
    if (!matchesFilter(task.context, filter)) return false;
    if (f.status !== "all" && task.status !== f.status) return false;

    if (f.chip === "due" && task.due === null) return false;
    if (f.chip === "snoozed" && !isSnoozed(task.snoozeUntil, now)) return false;
    if (f.chip === "goal" && task.goalId === null) return false;

    if (needle && !task.title.toLowerCase().includes(needle)) return false;

    return true;
  });

  return result.sort(byCreatedAsc);
}

/* ------------------------------------------------------------------ GOAL(s) */

export interface GoalProgress {
  done: number;
  total: number;
  pct: number;
}

/**
 * Goal progress (ADR-0002 + glossary): done ÷ non-dropped linked tasks.
 * Dropped tasks are excluded from BOTH numerator and denominator; snoozed
 * tasks still count; subtasks never contribute. 0/0 → pct 0.
 */
export function selectGoalProgress(goalId: string, tasks: Task[]): GoalProgress {
  let done = 0;
  let total = 0;

  for (const task of tasks) {
    if (task.goalId !== goalId) continue;
    if (task.status === "dropped") continue;
    total += 1;
    if (task.status === "done") done += 1;
  }

  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, pct };
}

/** Live linked tasks for a goal, split into open (incl. snoozed) and done. */
export function selectGoalTasks(goalId: string, tasks: Task[]): { open: Task[]; done: Task[] } {
  const open: Task[] = [];
  const done: Task[] = [];

  for (const task of tasks) {
    if (task.goalId !== goalId) continue;
    if (task.status === "open") open.push(task);
    else if (task.status === "done") done.push(task);
  }

  open.sort(byCreatedAsc);
  done.sort(byCreatedAsc);
  return { open, done };
}

/** Live linked notes for a goal, most-recently-updated first. */
export function selectGoalNotes(goalId: string, notes: Note[]): Note[] {
  return notes
    .filter((note) => note.goalId === goalId)
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
}

/**
 * Goals overview: `live` are active + onhold goals sorted by `target` ascending
 * with null targets last; `closed` are done + dropped goals (collapsed
 * section). The context filter applies to both.
 */
export function selectGoalsOverview(
  goals: Goal[],
  filter: ContextFilter,
): { live: Goal[]; closed: Goal[] } {
  const live: Goal[] = [];
  const closed: Goal[] = [];

  for (const goal of goals) {
    if (!matchesFilter(goal.context, filter)) continue;
    if (goal.status === "active" || goal.status === "onhold") live.push(goal);
    else closed.push(goal);
  }

  live.sort((a, b) => {
    if (a.target === null && b.target === null) return 0;
    if (a.target === null) return 1;
    if (b.target === null) return -1;
    if (a.target < b.target) return -1;
    if (a.target > b.target) return 1;
    return 0;
  });

  return { live, closed };
}

/* ----------------------------------------------------------------- ACTIVITY */

export interface DayActivity {
  /** Tasks whose `created` falls on the day (whatever their status is now). */
  created: Task[];
  /** Tasks whose `completed` falls on the day (i.e. marked done that day). */
  completed: Task[];
}

/**
 * Activity for one local day (ADR-0004): tasks created on `day` and tasks
 * completed on `day`, each in chronological order. A task created and finished
 * the same day appears in both lists. `day` is a local 'YYYY-MM-DD' key; stored
 * UTC timestamps are converted to local before bucketing. The context filter
 * applies. This is a read-only lens over current timestamps — reopening a task
 * clears its `completed`, so it then leaves that day's completed list.
 */
export function selectDayActivity(tasks: Task[], filter: ContextFilter, day: IsoDate): DayActivity {
  const created: Task[] = [];
  const completed: Task[] = [];

  for (const task of tasks) {
    if (!matchesFilter(task.context, filter)) continue;
    if (toLocalDateKeyFromIso(task.created) === day) created.push(task);
    if (task.completed && toLocalDateKeyFromIso(task.completed) === day) completed.push(task);
  }

  created.sort(byCreatedAsc);
  completed.sort((a, b) => {
    const ca = a.completed ?? "";
    const cb = b.completed ?? "";
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  return { created, completed };
}

/* -------------------------------------------------------------------- NOTES */

/**
 * Notes list: context filter + case-insensitive title substring. Body search is
 * async (bodies are lazy) and handled by the Notes view via getNoteBody; this
 * synchronous selector filters by title only. Most-recently-updated first.
 */
export function selectNotes(notes: Note[], filter: ContextFilter, query: string): Note[] {
  const needle = query.trim().toLowerCase();

  return notes
    .filter((note) => {
      if (!matchesFilter(note.context, filter)) return false;
      if (needle && !note.title.toLowerCase().includes(needle)) return false;
      return true;
    })
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
}
