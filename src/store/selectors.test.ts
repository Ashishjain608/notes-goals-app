/**
 * Unit tests for the pure selectors. All day-boundary behavior is pinned with a
 * fixed `now` so the local-day rules (ADR-0004) are deterministic regardless of
 * the machine's clock. Selectors need no mocks — they are pure.
 */

import { describe, expect, it } from "vitest";
import type { Goal, Note, Task } from "@/types";
import {
  goalsById,
  selectBacklog,
  selectDayActivity,
  selectGoalNotes,
  selectGoalProgress,
  selectGoalTasks,
  selectGoalsOverview,
  selectNotes,
  selectToday,
} from "./selectors";
import { toLocalDateKey } from "@/lib/dates";

/** Fixed local-day reference for every test: 2026-06-07 (local noon). */
const NOW = new Date(2026, 5, 7, 12, 0, 0);

/* ---------------------------------------------------------------- factories */

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
    ...overrides,
  };
}

function makeNote(overrides: Partial<Note> = {}): Note {
  seq += 1;
  return {
    id: `n${seq}`,
    title: `Note ${seq}`,
    context: "office",
    goalId: null,
    created: "2026-06-01T09:00:00Z",
    updated: "2026-06-01T09:00:00Z",
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  seq += 1;
  return {
    id: `g${seq}`,
    title: `Goal ${seq}`,
    description: "",
    context: "office",
    status: "active",
    target: null,
    created: "2026-06-01T09:00:00Z",
    updated: "2026-06-01T09:00:00Z",
    ...overrides,
  };
}

/* ----------------------------------------------------------------- goalsById */

describe("goalsById", () => {
  it("indexes goals by id", () => {
    const a = makeGoal({ id: "ga" });
    const b = makeGoal({ id: "gb" });
    const map = goalsById([a, b]);
    expect(map["ga"]).toBe(a);
    expect(map["gb"]).toBe(b);
    expect(map["missing"]).toBeUndefined();
  });
});

/* ----------------------------------------------------------------- selectToday */

describe("selectToday", () => {
  it("groups open un-snoozed tasks by context, oldest-created first", () => {
    const o1 = makeTask({ id: "o1", context: "office", created: "2026-06-03T09:00:00Z" });
    const o2 = makeTask({ id: "o2", context: "office", created: "2026-06-01T09:00:00Z" });
    const p1 = makeTask({ id: "p1", context: "personal", created: "2026-06-02T09:00:00Z" });

    const view = selectToday([o1, o2, p1], "all", NOW);

    expect(view.office.map((t) => t.id)).toEqual(["o2", "o1"]); // oldest first
    expect(view.personal.map((t) => t.id)).toEqual(["p1"]);
    expect(view.openCount).toBe(3);
  });

  it("excludes future-snoozed tasks but includes ones snoozed until today (inclusive)", () => {
    const future = makeTask({ id: "future", snoozeUntil: "2026-06-08" }); // tomorrow → hidden
    const today = makeTask({ id: "today", snoozeUntil: "2026-06-07" }); // today → reappears
    const past = makeTask({ id: "past", snoozeUntil: "2026-06-01" }); // past → visible

    const view = selectToday([future, today, past], "all", NOW);
    const ids = view.office.map((t) => t.id);

    expect(ids).toContain("today");
    expect(ids).toContain("past");
    expect(ids).not.toContain("future");
    expect(view.openCount).toBe(2);
  });

  it("tucks done-today tasks into completedToday and excludes dropped-today", () => {
    const doneToday = makeTask({
      id: "doneT",
      status: "done",
      completed: "2026-06-07T18:00:00Z",
    });
    const doneYesterday = makeTask({
      id: "doneY",
      status: "done",
      completed: "2026-06-06T18:00:00Z",
    });
    const droppedToday = makeTask({ id: "dropT", status: "dropped" });

    const view = selectToday([doneToday, doneYesterday, droppedToday], "all", NOW);

    expect(view.completedToday.map((t) => t.id)).toEqual(["doneT"]);
    expect(view.office).toHaveLength(0);
    expect(view.openCount).toBe(0);
  });

  it("uses local-day (not UTC-day) for completed-today (ADR-0004)", () => {
    // A completion whose LOCAL calendar date is Jun 7 counts as done today,
    // regardless of how the underlying instant maps to UTC. (Local-day math is
    // owned + unit-tested in lib/dates; here we assert selectToday honors it.)
    const lateNight = makeTask({
      id: "late",
      status: "done",
      completed: "2026-06-07T23:30:00", // local Jun 7 evening
    });
    const view = selectToday([lateNight], "all", NOW);
    expect(view.completedToday.map((t) => t.id)).toEqual(["late"]);
  });

  it("applies the context filter", () => {
    const o = makeTask({ id: "o", context: "office" });
    const p = makeTask({ id: "p", context: "personal" });

    const view = selectToday([o, p], "office", NOW);
    expect(view.office.map((t) => t.id)).toEqual(["o"]);
    expect(view.personal).toHaveLength(0);
    expect(view.openCount).toBe(1);
  });

  it("reports oldestAgeDays as the largest age among visible open tasks", () => {
    const young = makeTask({ id: "young", created: "2026-06-06T09:00:00Z" }); // 1d
    const old = makeTask({ id: "old", created: "2026-06-01T09:00:00Z" }); // 6d
    const view = selectToday([young, old], "all", NOW);
    expect(view.oldestAgeDays).toBe(6);
  });

  it("reports oldestAgeDays 0 when there are no open tasks", () => {
    const done = makeTask({ status: "done", completed: "2026-06-07T10:00:00Z" });
    const view = selectToday([done], "all", NOW);
    expect(view.oldestAgeDays).toBe(0);
  });
});

/* ----------------------------------------------------------------- selectBacklog */

describe("selectBacklog", () => {
  const open1 = makeTask({ id: "b1", status: "open", created: "2026-06-03T09:00:00Z" });
  const open2 = makeTask({ id: "b2", status: "open", created: "2026-06-01T09:00:00Z" });
  const done1 = makeTask({ id: "b3", status: "done", created: "2026-06-02T09:00:00Z" });
  const dropped1 = makeTask({ id: "b4", status: "dropped", created: "2026-06-04T09:00:00Z" });
  const all = [open1, open2, done1, dropped1];

  it("filters by status tab and sorts oldest-created first", () => {
    const res = selectBacklog(all, "all", { status: "open", chip: null, query: "" }, NOW);
    expect(res.map((t) => t.id)).toEqual(["b2", "b1"]);
  });

  it("returns every status when tab is all", () => {
    const res = selectBacklog(all, "all", { status: "all", chip: null, query: "" }, NOW);
    expect(res.map((t) => t.id)).toEqual(["b2", "b3", "b1", "b4"]); // oldest-first across statuses
  });

  it("filters by the due chip", () => {
    const withDue = makeTask({ id: "due", due: "2026-06-10" });
    const res = selectBacklog([open1, withDue], "all", { status: "all", chip: "due", query: "" }, NOW);
    expect(res.map((t) => t.id)).toEqual(["due"]);
  });

  it("filters by the snoozed chip (currently snoozed only)", () => {
    const snoozedFuture = makeTask({ id: "snz", snoozeUntil: "2026-06-09" });
    const snoozedPast = makeTask({ id: "exp", snoozeUntil: "2026-06-01" });
    const res = selectBacklog(
      [snoozedFuture, snoozedPast],
      "all",
      { status: "all", chip: "snoozed", query: "" },
      NOW,
    );
    expect(res.map((t) => t.id)).toEqual(["snz"]);
  });

  it("filters by the goal chip", () => {
    const linked = makeTask({ id: "lnk", goalId: "g1" });
    const res = selectBacklog([open1, linked], "all", { status: "all", chip: "goal", query: "" }, NOW);
    expect(res.map((t) => t.id)).toEqual(["lnk"]);
  });

  it("filters by case-insensitive title substring", () => {
    const a = makeTask({ id: "a", title: "Write the RFC" });
    const b = makeTask({ id: "b", title: "Lunch" });
    const res = selectBacklog([a, b], "all", { status: "all", chip: null, query: "rfc" }, NOW);
    expect(res.map((t) => t.id)).toEqual(["a"]);
  });

  it("applies the context filter", () => {
    const o = makeTask({ id: "o", context: "office" });
    const p = makeTask({ id: "p", context: "personal" });
    const res = selectBacklog([o, p], "personal", { status: "all", chip: null, query: "" }, NOW);
    expect(res.map((t) => t.id)).toEqual(["p"]);
  });
});

/* ----------------------------------------------------------------- goal progress */

describe("selectGoalProgress", () => {
  it("computes done ÷ non-dropped, excluding dropped and counting snoozed", () => {
    const tasks = [
      makeTask({ goalId: "g", status: "done" }),
      makeTask({ goalId: "g", status: "done" }),
      makeTask({ goalId: "g", status: "open" }),
      makeTask({ goalId: "g", status: "open", snoozeUntil: "2026-12-31" }), // snoozed → still counts
      makeTask({ goalId: "g", status: "dropped" }), // dropped → excluded entirely
      makeTask({ goalId: "other", status: "done" }), // different goal → ignored
    ];
    const progress = selectGoalProgress("g", tasks);
    expect(progress.done).toBe(2);
    expect(progress.total).toBe(4); // 2 done + 2 open (snoozed counted), dropped excluded
    expect(progress.pct).toBe(50);
  });

  it("returns 0/0 → pct 0 for a goal with no non-dropped tasks", () => {
    const tasks = [makeTask({ goalId: "g", status: "dropped" })];
    expect(selectGoalProgress("g", tasks)).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it("ignores subtasks entirely (only top-level status matters)", () => {
    const tasks = [
      makeTask({
        goalId: "g",
        status: "open",
        subtasks: [
          { id: "s1", title: "a", status: "done" },
          { id: "s2", title: "b", status: "done" },
        ],
      }),
    ];
    expect(selectGoalProgress("g", tasks)).toEqual({ done: 0, total: 1, pct: 0 });
  });
});

/* ----------------------------------------------------------------- goal tasks/notes */

describe("selectGoalTasks", () => {
  it("splits linked tasks into open and done (dropped omitted), oldest-first", () => {
    const tasks = [
      makeTask({ id: "o2", goalId: "g", status: "open", created: "2026-06-03T09:00:00Z" }),
      makeTask({ id: "o1", goalId: "g", status: "open", created: "2026-06-01T09:00:00Z" }),
      makeTask({ id: "d1", goalId: "g", status: "done", created: "2026-06-02T09:00:00Z" }),
      makeTask({ id: "drp", goalId: "g", status: "dropped" }),
      makeTask({ id: "x", goalId: "other", status: "open" }),
    ];
    const res = selectGoalTasks("g", tasks);
    expect(res.open.map((t) => t.id)).toEqual(["o1", "o2"]);
    expect(res.done.map((t) => t.id)).toEqual(["d1"]);
  });
});

describe("selectGoalNotes", () => {
  it("returns linked notes most-recently-updated first", () => {
    const notes = [
      makeNote({ id: "older", goalId: "g", updated: "2026-06-01T09:00:00Z" }),
      makeNote({ id: "newer", goalId: "g", updated: "2026-06-05T09:00:00Z" }),
      makeNote({ id: "other", goalId: "x", updated: "2026-06-09T09:00:00Z" }),
    ];
    expect(selectGoalNotes("g", notes).map((n) => n.id)).toEqual(["newer", "older"]);
  });
});

/* ----------------------------------------------------------------- goals overview */

describe("selectGoalsOverview", () => {
  it("puts active+onhold in live (by target asc, nulls last) and done+dropped in closed", () => {
    const active2 = makeGoal({ id: "a2", status: "active", target: "2026-09-01" });
    const active1 = makeGoal({ id: "a1", status: "active", target: "2026-07-01" });
    const onhold = makeGoal({ id: "oh", status: "onhold", target: null }); // null → last
    const onholdEarly = makeGoal({ id: "ohe", status: "onhold", target: "2026-06-15" });
    const done = makeGoal({ id: "dn", status: "done", target: "2026-05-01" });
    const dropped = makeGoal({ id: "dr", status: "dropped", target: null });

    const { live, closed } = selectGoalsOverview(
      [active2, active1, onhold, onholdEarly, done, dropped],
      "all",
    );

    expect(live.map((g) => g.id)).toEqual(["ohe", "a1", "a2", "oh"]); // target asc, null last
    expect(closed.map((g) => g.id).sort()).toEqual(["dn", "dr"]);
  });

  it("applies the context filter to both buckets", () => {
    const office = makeGoal({ id: "o", status: "active", context: "office" });
    const personal = makeGoal({ id: "p", status: "active", context: "personal" });
    const closedOffice = makeGoal({ id: "co", status: "done", context: "office" });

    const { live, closed } = selectGoalsOverview([office, personal, closedOffice], "office");
    expect(live.map((g) => g.id)).toEqual(["o"]);
    expect(closed.map((g) => g.id)).toEqual(["co"]);
  });
});

/* ----------------------------------------------------------------- notes search */

describe("selectNotes", () => {
  it("filters by context and case-insensitive title, most-recent first", () => {
    const a = makeNote({ id: "a", title: "RTSP findings", updated: "2026-06-01T09:00:00Z" });
    const b = makeNote({ id: "b", title: "rtsp follow-up", updated: "2026-06-05T09:00:00Z" });
    const c = makeNote({ id: "c", title: "Groceries", context: "personal" });

    const res = selectNotes([a, b, c], "office", "RTSP");
    expect(res.map((n) => n.id)).toEqual(["b", "a"]); // newer first, personal excluded
  });

  it("returns all matching when query is empty", () => {
    const a = makeNote({ id: "a" });
    const res = selectNotes([a], "all", "");
    expect(res.map((n) => n.id)).toEqual(["a"]);
  });
});

/* ----------------------------------------------------------------- activity */

describe("selectDayActivity", () => {
  // Build timestamps from LOCAL components so day bucketing is timezone-stable.
  const isoAt = (y: number, mo: number, d: number, h = 10): string =>
    new Date(y, mo, d, h).toISOString();
  const dayKey = (y: number, mo: number, d: number): string => toLocalDateKey(new Date(y, mo, d));

  it("buckets tasks by their created and completed local day", () => {
    const createdToday = makeTask({ created: isoAt(2026, 5, 8) });
    const completedToday = makeTask({
      created: isoAt(2026, 5, 1),
      status: "done",
      completed: isoAt(2026, 5, 8, 15),
    });
    const otherDay = makeTask({ created: isoAt(2026, 5, 9) });

    const res = selectDayActivity([createdToday, completedToday, otherDay], "all", dayKey(2026, 5, 8));
    expect(res.created.map((t) => t.id)).toEqual([createdToday.id]);
    expect(res.completed.map((t) => t.id)).toEqual([completedToday.id]);
  });

  it("lists a task created and completed the same day in both buckets", () => {
    const t = makeTask({
      created: isoAt(2026, 5, 8, 9),
      status: "done",
      completed: isoAt(2026, 5, 8, 17),
    });
    const res = selectDayActivity([t], "all", dayKey(2026, 5, 8));
    expect(res.created.map((x) => x.id)).toEqual([t.id]);
    expect(res.completed.map((x) => x.id)).toEqual([t.id]);
  });

  it("honors the context filter", () => {
    const office = makeTask({ created: isoAt(2026, 5, 8), context: "office" });
    const personal = makeTask({ created: isoAt(2026, 5, 8), context: "personal" });
    const day = dayKey(2026, 5, 8);
    expect(selectDayActivity([office, personal], "office", day).created.map((t) => t.id)).toEqual([
      office.id,
    ]);
    expect(selectDayActivity([office, personal], "personal", day).created.map((t) => t.id)).toEqual([
      personal.id,
    ]);
  });

  it("sorts each bucket chronologically", () => {
    const early = makeTask({ created: isoAt(2026, 5, 8, 8) });
    const late = makeTask({ created: isoAt(2026, 5, 8, 20) });
    const res = selectDayActivity([late, early], "all", dayKey(2026, 5, 8));
    expect(res.created.map((t) => t.id)).toEqual([early.id, late.id]);
  });
});
