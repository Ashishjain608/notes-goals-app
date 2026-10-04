/**
 * Natural-language capture parser for the phone composer. Pure: all day math is
 * LOCAL (ADR-0004) and `now` is injectable.
 *
 * Decisions: "next friday" == "friday" (next occurrence strictly after today);
 * "due"/"by" before a date is part of it ("Stop by Mon" reads as due Monday);
 * only the first date, first context and first goal are consumed — later ones
 * stay in the title; only active/onhold goals match.
 */
import type { Context, Goal, IsoDate } from "@/types";
import { dateKeyDaysAhead } from "@/views/Capture/dueDates";
import { toLocalDateKey } from "@/lib/dates";

export interface CaptureToken {
  kind: "date" | "context" | "goal";
  /** [start, end) offsets into the ORIGINAL text, for inline highlighting. */
  start: number;
  end: number;
  text: string;
}

export interface ParsedCapture {
  /** Text with every recognised token removed and whitespace collapsed/trimmed. */
  title: string;
  due: IsoDate | null;
  context: Context | null;
  goalId: string | null;
  tokens: CaptureToken[]; // sorted by start
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DAY_RE = "sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?";
const ORD = "(?:st|nd|rd|th)?";

// One alternation; leftmost match wins. Groups: wd, nextweek, weekend, rel, n, unit, m1/d1, d2/m2.
const DATE_RE = new RegExp(
  "(?<![\\w#-])(?:(?:due|by)\\s+)?(?:" +
    [
      "(?<rel>today|tonight|tomorrow|tmrw|tmr)",
      `(?:(?:on|next)\\s+)?(?<wd>${DAY_RE})`,
      "(?<nextweek>next\\s+week)",
      "(?<weekend>(?:this\\s+)?weekend)",
      "in\\s+(?<n>\\d{1,3}|an?)\\s+(?<unit>days?|weeks?)",
      `(?:on\\s+)?(?:(?<m1>${MONTH_RE})\\.?\\s+(?<d1>\\d{1,2})${ORD}|(?<d2>\\d{1,2})${ORD}\\s+(?<m2>${MONTH_RE})\\.?)`,
    ].join("|") +
    ")(?![\\w'’])",
  "gi",
);

const monthIndex = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase());

function resolveDate(g: Record<string, string | undefined>, now: Date): IsoDate | null {
  const dow = now.getDay();
  const ahead = (n: number) => dateKeyDaysAhead(n, now);
  if (g.rel) return ahead(/^to(day|night)$/i.test(g.rel) ? 0 : 1);
  if (g.wd) return ahead(((WEEKDAYS.indexOf(g.wd.slice(0, 3).toLowerCase()) - dow + 7) % 7) || 7);
  if (g.nextweek) return ahead(((1 - dow + 7) % 7) || 7);
  if (g.weekend) return ahead((6 - dow + 7) % 7);
  if (g.unit) {
    const n = /^an?$/i.test(g.n!) ? 1 : Number(g.n);
    if (n < 1 || n > 365) return null;
    return ahead(/^w/i.test(g.unit) ? n * 7 : n);
  }
  const month = monthIndex((g.m1 ?? g.m2)!);
  const day = Number(g.d1 ?? g.d2);
  const today = toLocalDateKey(now);
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const d = new Date(year, month, day);
    if (d.getMonth() !== month) return null; // e.g. Feb 30
    const key = toLocalDateKey(d);
    if (key >= today) return key;
  }
  return null;
}

const slug = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "-");

export function parseCapture(
  text: string,
  opts: { now?: Date; goals?: Pick<Goal, "id" | "title" | "status">[] } = {},
): ParsedCapture {
  const now = opts.now ?? new Date();
  const tokens: CaptureToken[] = [];
  const tok = (kind: CaptureToken["kind"], start: number, end: number) =>
    tokens.push({ kind, start, end, text: text.slice(start, end) });

  let due: IsoDate | null = null;
  for (const m of text.matchAll(DATE_RE)) {
    const d = resolveDate(m.groups ?? {}, now);
    if (d) {
      due = d;
      tok("date", m.index!, m.index! + m[0].length);
      break;
    }
  }

  let context: Context | null = null;
  let goalId: string | null = null;
  const candidates = (opts.goals ?? [])
    .filter((g) => g.status === "active" || g.status === "onhold")
    .sort((a, b) => a.title.length - b.title.length); // stable: shortest, then first
  for (const m of text.matchAll(/(?<![\w#])#([\w-]+)/g)) {
    const tag = m[1]!.toLowerCase();
    const start = m.index!;
    const end = start + m[0].length;
    if (tag === "office" || tag === "personal") {
      if (!context) {
        context = tag;
        tok("context", start, end);
      }
    } else if (!goalId) {
      const g = candidates.find((c) => slug(c.title).startsWith(slug(tag)));
      if (g) {
        goalId = g.id;
        tok("goal", start, end);
      }
    }
  }

  tokens.sort((a, b) => a.start - b.start);
  let title = "";
  let pos = 0;
  for (const t of tokens) {
    title += text.slice(pos, t.start) + " ";
    pos = t.end;
  }
  title = (title + text.slice(pos)).replace(/\s+/g, " ").trim();
  return { title, due, context, goalId, tokens };
}
