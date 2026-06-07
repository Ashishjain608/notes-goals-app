/**
 * Local-day date helpers for the capture surfaces.
 *
 * Due dates and snooze dates are stored as bare `YYYY-MM-DD` calendar keys
 * (see docs/adr/0004). These helpers build those keys from "N days from now"
 * offsets in the user's LOCAL timezone, mirroring `src/lib/dates.ts`'s
 * `toLocalDateKey` so day boundaries never drift across UTC.
 */
import type { IsoDate } from "@/types";
import { toLocalDateKey } from "@/lib/dates";

/** A new Date `days` after `from` (negative offsets go back in time). */
export function addDays(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

/** The local `YYYY-MM-DD` key for a day `days` from now (0 = today). */
export function dateKeyDaysAhead(days: number, from: Date = new Date()): IsoDate {
  return toLocalDateKey(addDays(days, from));
}
