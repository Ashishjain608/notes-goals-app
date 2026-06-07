/**
 * Local-day date/time helpers.
 *
 * THE RULE (docs/adr/0004): every day-boundary comparison is done in the user's
 * LOCAL timezone, never UTC. Stored datetimes are UTC ('...Z'); we convert to
 * local before comparing calendar days. Stored dates are bare 'YYYY-MM-DD' and
 * are already timezone-agnostic.
 *
 * Every function accepts an injectable `now` for deterministic testing.
 */

import type { IsoDate, IsoDateTime } from "@/types";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Format a JS Date as its LOCAL 'YYYY-MM-DD'. */
export function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local calendar date as 'YYYY-MM-DD'. */
export function localToday(now: Date = new Date()): IsoDate {
  return toLocalDateKey(now);
}

/**
 * Normalize any stored value to a LOCAL 'YYYY-MM-DD'.
 * Bare calendar dates pass through; UTC datetimes are converted to local first.
 */
export function toLocalDateKeyFromIso(iso: string): IsoDate {
  if (DATE_ONLY.test(iso)) return iso;
  return toLocalDateKey(new Date(iso));
}

/** Local midnight of a 'YYYY-MM-DD'. */
function startOfLocalDay(dateKey: string): Date {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
}

function dayDiff(fromKey: string, toKey: string): number {
  return Math.round(
    (startOfLocalDay(toKey).getTime() - startOfLocalDay(fromKey).getTime()) / MS_PER_DAY,
  );
}

/** Whole days a task has been open: localToday − localDate(created). Never negative. */
export function ageInDays(createdIso: IsoDateTime, now: Date = new Date()): number {
  return Math.max(0, dayDiff(toLocalDateKeyFromIso(createdIso), localToday(now)));
}

/**
 * A task is snoozed (hidden from Today) only when snoozeUntil is strictly AFTER
 * today. snooze is inclusive: snoozeUntil == today → NOT snoozed (it reappears).
 */
export function isSnoozed(snoozeUntil: IsoDate | null, now: Date = new Date()): boolean {
  if (!snoozeUntil) return false;
  return toLocalDateKeyFromIso(snoozeUntil) > localToday(now);
}

/** True when a completed datetime falls on the local TODAY. */
export function isCompletedToday(completedIso: IsoDateTime | null, now: Date = new Date()): boolean {
  if (!completedIso) return false;
  return toLocalDateKeyFromIso(completedIso) === localToday(now);
}

export type DueTone = "overdue" | "soon" | "normal";
export interface DueLabel {
  text: string;
  tone: DueTone;
}

/** Relative due label ("2d overdue", "Due today", "Due in 3d", "Due Jun 7"), local days. */
export function dueLabel(due: IsoDate | null, now: Date = new Date()): DueLabel | null {
  if (!due) return null;
  const diff = dayDiff(localToday(now), toLocalDateKeyFromIso(due));
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, tone: "overdue" };
  if (diff === 0) return { text: "Due today", tone: "soon" };
  if (diff === 1) return { text: "Due tomorrow", tone: "soon" };
  if (diff <= 6) return { text: `Due in ${diff}d`, tone: "normal" };
  return { text: `Due ${formatShortDate(due) ?? ""}`, tone: "normal" };
}

/** "Jun 7"-style short date from an ISO date or datetime. */
export function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = DATE_ONLY.test(iso) ? startOfLocalDay(iso) : new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
