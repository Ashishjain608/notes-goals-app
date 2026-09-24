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

import type { ContextFilter, Goal, IsoDate, Note, Notebook, Task, TaskStatus } from "@/types";
import {
  ageInDays,
  isCompletedToday,
  isSnoozed,
  localToday,
  toLocalDateKeyFromIso,
} from "@/lib/dates";

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

/**
 * The active-list ordering: priority-flagged first, then soonest `due`
 * (overdue → due-soon; undated last), then oldest-`created`. Due dates are bare
 * 'YYYY-MM-DD', so a lexicographic compare is chronological.
 */
function byPriorityDueAge(a: Task, b: Task): number {
  if (a.priority !== b.priority) return a.priority ? -1 : 1;
  if (a.due !== b.due) {
    if (a.due === null) return 1; // undated sinks below anything dated
    if (b.due === null) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return byCreatedAsc(a, b);
}

/* -------------------------------------------------------------- goal lookup */

/** Index goals by id for O(1) resolution from tasks/notes. */
export function goalsById(goals: Goal[]): Record<string, Goal> {
  const map: Record<string, Goal> = {};
  for (const goal of goals) map[goal.id] = goal;
  return map;
}

/* -------------------------------------------------------------------- TODAY */

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

/** True when this task is committed to the local day `day`. */
function isOnSlate(task: Task, day: IsoDate): boolean {
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

/**
 * The state of today's slate across ALL contexts. Global on purpose, and
 * deliberately NOT part of TodayView: the scarce thing is your hours, not your
 * office/personal split, so the cap and the finish line must not move when the
 * context filter does. Dropped tasks free their slot.
 */
export function selectSlate(
  tasks: Task[],
  cap: number = DEFAULT_SLATE_CAP,
  now: Date = new Date(),
): SlateSummary {
  const today = localToday(now);
  let openCount = 0;
  let doneCount = 0;

  for (const task of tasks) {
    if (task.status === "dropped" || !isOnSlate(task, today)) continue;
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

export interface TodayView {
  /** Open tasks committed to today, in the standard active-list order. */
  committed: Task[];
  /** Today's committed tasks that are already done. */
  slateDone: Task[];
  office: Task[];
  personal: Task[];
  completedToday: Task[];
  openCount: number;
  oldestAgeDays: number;
}

/**
 * Today (ADR-0004, ADR-0009): open + un-snoozed tasks within the filter,
 * grouped by context and sorted oldest-`created` first; plus tasks marked done
 * today (tucked at the bottom). A task dropped today is excluded — only
 * done-today keeps a courtesy slot. `openCount` counts every visible open task
 * (slate included); `oldestAgeDays` is the largest age among them (0 when none).
 *
 * Tasks committed to today are lifted out of the office/personal columns into
 * `committed` so they appear exactly once. A commitment from an EARLIER day is
 * not a commitment today — that task simply falls back into the pool, which is
 * what makes the slate an honest daily decision rather than a growing backlog.
 */
export function selectToday(tasks: Task[], filter: ContextFilter, now: Date = new Date()): TodayView {
  const today = localToday(now);
  const committed: Task[] = [];
  const slateDone: Task[] = [];
  const office: Task[] = [];
  const personal: Task[] = [];
  const completedToday: Task[] = [];

  for (const task of tasks) {
    if (!matchesFilter(task.context, filter)) continue;

    if (task.status === "open" && !isSnoozed(task.snoozeUntil, now)) {
      if (isOnSlate(task, today)) committed.push(task);
      else if (task.context === "office") office.push(task);
      else personal.push(task);
    } else if (task.status === "done" && isCompletedToday(task.completed, now)) {
      completedToday.push(task);
      if (isOnSlate(task, today)) slateDone.push(task);
    }
  }

  committed.sort(byPriorityDueAge);
  office.sort(byPriorityDueAge);
  personal.sort(byPriorityDueAge);
  completedToday.sort(byCreatedAsc);
  slateDone.sort(byCreatedAsc);

  const open = [...committed, ...office, ...personal];
  const oldestAgeDays = open.reduce(
    (oldest, task) => Math.max(oldest, ageInDays(task.created, now)),
    0,
  );

  return {
    committed,
    slateDone,
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

  return result.sort(byPriorityDueAge);
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

  open.sort(byPriorityDueAge);
  done.sort(byCreatedAsc);
  return { open, done };
}

/**
 * Live linked notes for a goal, most-recently-updated first. A note counts only
 * when its context also matches the goal's — a context-mismatched link reads as
 * unlinked (symmetric to the notebook rule, ADR-0008).
 */
export function selectGoalNotes(goal: Goal, notes: Note[]): Note[] {
  return notes
    .filter((note) => note.goalId === goal.id && note.context === goal.context)
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

/* ---------------------------------------------------------------- NOTEBOOKS */

/** Notebooks within the context filter, ordered alphabetically by name (ADR-0008). */
export function selectNotebooks(notebooks: Notebook[], filter: ContextFilter): Notebook[] {
  return notebooks
    .filter((nb) => matchesFilter(nb.context, filter))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export interface NotebookGroup {
  notebook: Notebook;
  notes: Note[];
}

export interface NotesByNotebook {
  /** One entry per shown notebook (alphabetical), each with its notes. */
  groups: NotebookGroup[];
  /** Notes belonging to no visible same-context notebook (the Unfiled group). */
  unfiled: Note[];
  /** True while a search query is narrowing the results. */
  searching: boolean;
}

/**
 * Group notes by notebook for the Notes list (ADR-0008). A note is filed under a
 * notebook only when its notebookId resolves to a visible notebook of the *same*
 * context; a dangling or context-mismatched pointer falls into Unfiled. Notes
 * keep the shared most-recently-updated order within each group.
 *
 * Search matches notebooks AND notes: a notebook whose *name* matches surfaces
 * with all of its notes; a notebook that merely *contains* title-matching notes
 * surfaces with just those; non-matching notebooks are dropped. Matching Unfiled
 * notes appear in `unfiled`.
 */
export function selectNotesByNotebook(
  notes: Note[],
  notebooks: Notebook[],
  filter: ContextFilter,
  query: string,
): NotesByNotebook {
  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const titleMatches = (n: Note): boolean => !searching || n.title.toLowerCase().includes(needle);

  const books = selectNotebooks(notebooks, filter);
  const booksById = new Map(books.map((b) => [b.id, b] as const));

  // All in-context notes, most-recently-updated first, partitioned by notebook.
  const inContext = notes
    .filter((n) => matchesFilter(n.context, filter))
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));

  const filed = new Map<string, Note[]>();
  const unfiledAll: Note[] = [];
  for (const note of inContext) {
    const book = note.notebookId ? booksById.get(note.notebookId) : undefined;
    if (book && book.context === note.context) {
      const list = filed.get(book.id);
      if (list) list.push(note);
      else filed.set(book.id, [note]);
    } else {
      unfiledAll.push(note);
    }
  }

  const groups: NotebookGroup[] = [];
  for (const notebook of books) {
    const all = filed.get(notebook.id) ?? [];
    if (!searching) {
      groups.push({ notebook, notes: all });
    } else if (notebook.name.toLowerCase().includes(needle)) {
      groups.push({ notebook, notes: all }); // name hit → surface the whole notebook
    } else {
      const hits = all.filter(titleMatches);
      if (hits.length > 0) groups.push({ notebook, notes: hits });
    }
  }

  const unfiled = searching ? unfiledAll.filter(titleMatches) : unfiledAll;

  return { groups, unfiled, searching };
}

/**
 * Enforce the notebook context invariant on a single note (ADR-0008): a note may
 * only stay filed in a notebook of its own context. If the note's notebook no
 * longer exists or its context diverged, return the note unfiled; otherwise
 * return it unchanged. Pure — used by the store before persisting an edit.
 */
export function reconcileNoteNotebook(note: Note, notebooks: Notebook[]): Note {
  if (note.notebookId === null) return note;
  const nb = notebooks.find((n) => n.id === note.notebookId);
  if (nb && nb.context === note.context) return note;
  return { ...note, notebookId: null };
}

/**
 * Enforce the note↔goal context invariant: a note may only stay linked to a goal
 * of its own context. If the linked goal's context diverged, return the note
 * unlinked; a *missing* goal is left dangling (ADR-0003 resilience — only an
 * in-app goal deletion clears that). Pure — used by the store before saving.
 */
export function reconcileNoteGoal(note: Note, goals: Goal[]): Note {
  if (note.goalId === null) return note;
  const goal = goals.find((g) => g.id === note.goalId);
  if (!goal || goal.context === note.context) return note;
  return { ...note, goalId: null };
}
