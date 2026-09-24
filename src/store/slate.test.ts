/**
 * Unit tests for the pure slate module (docs/adr/0009, docs/adr/0010). Day-
 * boundary behavior is pinned with a fixed `now`/`day` so it's deterministic
 * regardless of the machine's clock — same convention as selectors.test.ts,
 * which these `selectSlate`/`clampSlateCap` cases moved out of.
 */

import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import { toLocalDateKey } from "@/lib/dates";
import { clampSlateCap, commitTransition, DEFAULT_SLATE_CAP, isOnSlate, selectSlate } from "./slate";

/** Fixed local-day reference: 2026-06-07 (local noon), and its neighbours. */
const NOW = new Date(2026, 5, 7, 12, 0, 0);
const TODAY = toLocalDateKey(NOW);
const YESTERDAY = toLocalDateKey(new Date(2026, 5, 6, 12, 0, 0));
const TOMORROW = toLocalDateKey(new Date(2026, 5, 8, 12, 0, 0));

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    context: "office",
    status: "open",
    created: "2026-06-01T09:00:00Z",
    due: null,
    snoozeUntil: null,
    completed: null,
    goalId: null,
    subtasks: [],
    details: "",
    priority: false,
    committedOn: null,
    carried: 0,
    attachments: [],
    ...overrides,
  };
}

/* -------------------------------------------------------------------- isOnSlate */

describe("isOnSlate", () => {
  it("is false when the task has no commitment", () => {
    expect(isOnSlate(makeTask({ committedOn: null }), TODAY)).toBe(false);
  });

  it("is true only for a commitment on exactly that day", () => {
    expect(isOnSlate(makeTask({ committedOn: TODAY }), TODAY)).toBe(true);
    expect(isOnSlate(makeTask({ committedOn: YESTERDAY }), TODAY)).toBe(false);
  });

  it("normalizes a datetime-shaped committedOn to its local day before comparing", () => {
    const task = makeTask({ committedOn: "2026-06-07T23:30:00" }); // local Jun 7 evening
    expect(isOnSlate(task, "2026-06-07")).toBe(true);
    expect(isOnSlate(task, "2026-06-08")).toBe(false);
  });
});

/* ------------------------------------------------------------------ selectSlate */

describe("selectSlate", () => {
  it("counts only what is committed to TODAY, done included", () => {
    const tasks = [
      makeTask({ committedOn: TODAY }),
      makeTask({ committedOn: TODAY, status: "done", completed: "2026-06-07T10:00:00Z" }),
      makeTask({ committedOn: YESTERDAY }), // yesterday's promise is not today's
      makeTask({ committedOn: null }),
    ];

    const slate = selectSlate(tasks, DEFAULT_SLATE_CAP, NOW);

    expect(slate.count).toBe(2);
    expect(slate.openCount).toBe(1);
    expect(slate.doneCount).toBe(1);
    expect(slate.complete).toBe(false);
  });

  it("is complete only when something was committed and all of it is done", () => {
    const empty = selectSlate([makeTask()], DEFAULT_SLATE_CAP, NOW);
    expect(empty.complete).toBe(false); // an empty day is not a finished day

    const finished = selectSlate(
      [makeTask({ committedOn: TODAY, status: "done", completed: "2026-06-07T10:00:00Z" })],
      DEFAULT_SLATE_CAP,
      NOW,
    );
    expect(finished.complete).toBe(true);
  });

  it("fills at the cap, and a dropped task gives its slot back", () => {
    const full = Array.from({ length: DEFAULT_SLATE_CAP }, () => makeTask({ committedOn: TODAY }));
    expect(selectSlate(full, DEFAULT_SLATE_CAP, NOW).full).toBe(true);

    const [first, ...rest] = full;
    const withDrop = [{ ...first!, status: "dropped" as const }, ...rest];
    expect(selectSlate(withDrop, DEFAULT_SLATE_CAP, NOW).full).toBe(false);
    expect(selectSlate(withDrop, DEFAULT_SLATE_CAP, NOW).count).toBe(DEFAULT_SLATE_CAP - 1);
  });

  it("fills at whatever cap it is given, and reports that cap", () => {
    const three = Array.from({ length: 3 }, () => makeTask({ committedOn: TODAY }));
    expect(selectSlate(three, 3, NOW)).toMatchObject({ full: true, cap: 3 });
    expect(selectSlate(three, 4, NOW)).toMatchObject({ full: false, cap: 4 });
    // Lowering the cap below what's already committed keeps the commitments
    // and simply refuses new ones.
    expect(selectSlate(three, 2, NOW)).toMatchObject({ count: 3, full: true });
  });

  it("ignores the context filter entirely — the cap is on hours, not contexts", () => {
    const tasks = [
      makeTask({ context: "office", committedOn: TODAY }),
      makeTask({ context: "personal", committedOn: TODAY }),
    ];
    expect(selectSlate(tasks, DEFAULT_SLATE_CAP, NOW).count).toBe(2);
  });
});

describe("clampSlateCap", () => {
  it("keeps a whole number inside the bounds", () => {
    expect(clampSlateCap(3)).toBe(3);
    expect(clampSlateCap(0)).toBe(1);
    expect(clampSlateCap(-4)).toBe(1);
    expect(clampSlateCap(99)).toBe(10);
    expect(clampSlateCap(4.6)).toBe(5);
  });

  it("falls back to the default for garbage", () => {
    expect(clampSlateCap(Number.NaN)).toBe(DEFAULT_SLATE_CAP);
    expect(clampSlateCap(Number("abc"))).toBe(DEFAULT_SLATE_CAP);
  });
});

/* -------------------------------------------------------------- commitTransition */

describe("commitTransition", () => {
  it("commits a pooled task to the day", () => {
    const task = makeTask({ committedOn: null });
    const result = commitTransition(task, [task], DEFAULT_SLATE_CAP, TODAY);
    expect(result).toEqual({ task: { ...task, committedOn: TODAY, carried: 0 } });
  });

  it("uncommits a task already on the slate for that day", () => {
    const task = makeTask({ committedOn: TODAY });
    const result = commitTransition(task, [task], DEFAULT_SLATE_CAP, TODAY);
    expect(result).toEqual({ task: { ...task, committedOn: null } });
  });

  it("rejects a new commit once the slate is full", () => {
    const full = Array.from({ length: DEFAULT_SLATE_CAP }, () => makeTask({ committedOn: TODAY }));
    const pooled = makeTask({ committedOn: null });
    const result = commitTransition(pooled, [...full, pooled], DEFAULT_SLATE_CAP, TODAY);
    expect(result).toEqual({ rejected: "full" });
  });

  it("still allows uncommitting when the slate is over a lowered cap", () => {
    const tasks = Array.from({ length: 3 }, () => makeTask({ committedOn: TODAY }));
    const result = commitTransition(tasks[0]!, tasks, 1, TODAY);
    expect(result).toEqual({ task: { ...tasks[0]!, committedOn: null } });
  });

  it("a dropped task freeing its slot lets a new commit through", () => {
    const dropped = makeTask({ committedOn: TODAY, status: "dropped" });
    const pooled = makeTask({ committedOn: null });
    const result = commitTransition(pooled, [dropped, pooled], 1, TODAY);
    expect(result).toEqual({ task: { ...pooled, committedOn: TODAY, carried: 0 } });
  });

  it("increments carried only when the prior commitment was to an earlier day", () => {
    const fromYesterday = makeTask({ committedOn: YESTERDAY, carried: 2 });
    const carriedResult = commitTransition(fromYesterday, [fromYesterday], DEFAULT_SLATE_CAP, TODAY);
    expect(carriedResult).toEqual({ task: { ...fromYesterday, committedOn: TODAY, carried: 3 } });

    // A never-committed task starts carried at 0, unchanged.
    const fresh = makeTask({ committedOn: null, carried: 0 });
    const freshResult = commitTransition(fresh, [fresh], DEFAULT_SLATE_CAP, TODAY);
    expect(freshResult).toEqual({ task: { ...fresh, committedOn: TODAY, carried: 0 } });
  });

  it("does not increment carried for a future-dated commitment (defensive; shouldn't occur)", () => {
    const fromTomorrow = makeTask({ committedOn: TOMORROW, carried: 1 });
    const result = commitTransition(fromTomorrow, [fromTomorrow], DEFAULT_SLATE_CAP, TODAY);
    expect(result).toEqual({ task: { ...fromTomorrow, committedOn: TODAY, carried: 1 } });
  });
});
