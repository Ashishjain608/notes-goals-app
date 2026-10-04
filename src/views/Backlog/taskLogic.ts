/**
 * Phone Today/Tasks helpers: pure filter + meta-line logic, and the task
 * actions that offer an Undo (ADR-0012). The actions write the previous value
 * back through the normal store actions.
 */
import type { Goal, IsoDate, Task, TaskStatus } from "@/types";
import { isOnSlate, useStore } from "@/store";
import { dueLabel, formatShortDate, isSnoozed, localToday, toLocalDateKeyFromIso } from "@/lib/dates";
import { dateKeyDaysAhead } from "@/views/Capture/dueDates";

export type TaskChip = "due" | "snoozed" | "goal" | "office" | "personal";

/** True when the task passes every active chip. Office and Personal are alternatives, not both. */
export function matchesChips(task: Task, chips: ReadonlyArray<TaskChip>, now: Date = new Date()): boolean {
  const contexts = chips.filter((c) => c === "office" || c === "personal");
  if (contexts.length > 0 && !contexts.includes(task.context)) return false;
  if (chips.includes("due")) {
    // "Due soon": overdue or due within a week.
    if (task.due === null || toLocalDateKeyFromIso(task.due) > dateKeyDaysAhead(7, now)) return false;
  }
  if (chips.includes("snoozed") && !isSnoozed(task.snoozeUntil, now)) return false;
  if (chips.includes("goal") && task.goalId === null) return false;
  return true;
}

export interface MetaLine {
  text: string;
  overdue: boolean;
}

/** One meta line: "[On today ·] due · goal · snoozed"; empty text when nothing to say. */
export function metaLine(task: Task, goal: Goal | null, day: IsoDate, now: Date = new Date()): MetaLine {
  const due = dueLabel(task.due, now);
  const parts: string[] = [];
  if (task.committedOn && toLocalDateKeyFromIso(task.committedOn) === day) parts.push("On today");
  if (due) parts.push(due.text);
  if (goal) parts.push(goal.title);
  if (isSnoozed(task.snoozeUntil, now)) parts.push(`Snoozed to ${formatShortDate(task.snoozeUntil)}`);
  return { text: parts.join(" · "), overdue: due?.tone === "overdue" };
}

/** "Slate is full (5 of 5)". */
export const slateFullMessage = (cap: number): string => `Slate is full (${cap} of ${cap})`;

/* ------------------------------------------------------------ undoable actions */

const st = () => useStore.getState();

/** Set a task's status and offer Undo back to the previous one. */
export function setStatusWithUndo(task: Task, status: TaskStatus, label: string): void {
  const prev = task.status;
  void st().setTaskStatus(task.id, status);
  st().showUndo({ label, undo: () => st().setTaskStatus(task.id, prev) });
}

/** Done <-> open from a checkbox. */
export function toggleDoneWithUndo(task: Task): void {
  const done = task.status !== "done";
  setStatusWithUndo(task, done ? "done" : "open", done ? "Task done" : "Task reopened");
}

/** Commit or uncommit; a full slate shows the info toast instead. Resolves the new state. */
export async function toggleCommitWithUndo(task: Task, onSlate: boolean): Promise<void> {
  const ok = await st().toggleTaskCommit(task.id);
  if (!ok) {
    st().showUndo({ label: slateFullMessage(st().slateCap) });
    return;
  }
  st().showUndo({
    label: onSlate ? "Removed from today" : "Committed to today",
    undo: () => void st().toggleTaskCommit(task.id),
  });
}

/** Snooze (or un-snooze) and offer Undo back to the previous date, and the slate slot snoozing released. */
export function snoozeWithUndo(task: Task, until: IsoDate | null): void {
  const prev = task.snoozeUntil;
  const wasOnSlate = isOnSlate(task, localToday());
  void st().patchTask(task.id, { snoozeUntil: until });
  st().showUndo({
    label: until ? `Snoozed to ${formatShortDate(until)}` : "Un-snoozed",
    undo: async () => {
      await st().patchTask(task.id, { snoozeUntil: prev });
      const now = st().tasks.find((t) => t.id === task.id);
      if (wasOnSlate && now && !isOnSlate(now, localToday())) await st().toggleTaskCommit(task.id);
    },
  });
}
