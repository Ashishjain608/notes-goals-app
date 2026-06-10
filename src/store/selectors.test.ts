/**
 * Unit tests for the pure selectors. All day-boundary behavior is pinned with a
 * fixed `now` so the local-day rules (ADR-0004) are deterministic regardless of
 * the machine's clock. Selectors need no mocks — they are pure.
 */

import { describe, expect, it } from "vitest";
import type { Goal, Note, Notebook, Task } from "@/types";
import {
  goalsById,
  reconcileNoteGoal,
  reconcileNoteNotebook,
  selectBacklog,
  selectDayActivity,
  selectGoalNotes,
  selectGoalProgress,
  selectGoalTasks,
  selectGoalsOverview,
  selectNotebooks,
  selectNotes,
  selectNotesByNotebook,
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
    priority: false,
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
    notebookId: null,
    created: "2026-06-01T09:00:00Z",
    updated: "2026-06-01T09:00:00Z",
    ...overrides,
  };
}

function makeNotebook(overrides: Partial<Notebook> = {}): Notebook {
  seq += 1;
  return {
    id: `nb${seq}`,
    name: `Notebook ${seq}`,
    context: "office",
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
  const goal = makeGoal({ id: "g", context: "office" });

  it("returns linked notes most-recently-updated first", () => {
    const notes = [
      makeNote({ id: "older", goalId: "g", updated: "2026-06-01T09:00:00Z" }),
      makeNote({ id: "newer", goalId: "g", updated: "2026-06-05T09:00:00Z" }),
      makeNote({ id: "other", goalId: "x", updated: "2026-06-09T09:00:00Z" }),
    ];
    expect(selectGoalNotes(goal, notes).map((n) => n.id)).toEqual(["newer", "older"]);
  });

  it("excludes a linked note whose context no longer matches the goal", () => {
    const notes = [
      makeNote({ id: "match", goalId: "g", context: "office" }),
      makeNote({ id: "mismatch", goalId: "g", context: "personal" }),
    ];
    expect(selectGoalNotes(goal, notes).map((n) => n.id)).toEqual(["match"]);
  });
});

describe("reconcileNoteGoal", () => {
  const goal = makeGoal({ id: "g", context: "office" });

  it("keeps a note linked to a same-context goal", () => {
    const note = makeNote({ goalId: "g", context: "office" });
    expect(reconcileNoteGoal(note, [goal])).toBe(note);
  });

  it("unlinks a note whose context diverged from its goal", () => {
    const note = makeNote({ goalId: "g", context: "personal" });
    expect(reconcileNoteGoal(note, [goal]).goalId).toBeNull();
  });

  it("leaves a dangling goal link untouched (ADR-0003 resilience)", () => {
    const note = makeNote({ goalId: "ghost", context: "office" });
    expect(reconcileNoteGoal(note, [goal]).goalId).toBe("ghost");
  });

  it("leaves an already-unlinked note untouched", () => {
    const note = makeNote({ goalId: null });
    expect(reconcileNoteGoal(note, [goal])).toBe(note);
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

/* ----------------------------------------------------------------- notebooks */

describe("selectNotebooks", () => {
  it("filters by context and sorts alphabetically (case-insensitive)", () => {
    const work = makeNotebook({ id: "w", name: "work", context: "office" });
    const archive = makeNotebook({ id: "a", name: "Archive", context: "office" });
    const home = makeNotebook({ id: "h", name: "Home", context: "personal" });

    expect(selectNotebooks([work, archive, home], "office").map((n) => n.id)).toEqual(["a", "w"]);
    expect(selectNotebooks([work, archive, home], "all").map((n) => n.id)).toEqual(["a", "h", "w"]);
  });
});

describe("selectNotesByNotebook", () => {
  it("groups notes under their notebook and leaves the rest Unfiled", () => {
    const work = makeNotebook({ id: "work", name: "Work", context: "office" });
    const filed = makeNote({ id: "f", notebookId: "work", context: "office" });
    const loose = makeNote({ id: "l", notebookId: null, context: "office" });

    const res = selectNotesByNotebook([filed, loose], [work], "office", "");
    expect(res.searching).toBe(false);
    expect(res.groups.map((g) => g.notebook.id)).toEqual(["work"]);
    expect(res.groups[0]?.notes.map((n) => n.id)).toEqual(["f"]);
    expect(res.unfiled.map((n) => n.id)).toEqual(["l"]);
  });

  it("treats a context-mismatched or dangling notebookId as Unfiled (ADR-0008)", () => {
    const officeBook = makeNotebook({ id: "ob", name: "Work", context: "office" });
    // Note claims a notebook of a different context.
    const mismatched = makeNote({ id: "m", notebookId: "ob", context: "personal" });
    // Note points at a notebook that doesn't exist.
    const dangling = makeNote({ id: "d", notebookId: "ghost", context: "personal" });

    const res = selectNotesByNotebook([mismatched, dangling], [officeBook], "personal", "");
    expect(res.groups).toEqual([]); // no personal notebooks visible
    expect(res.unfiled.map((n) => n.id).sort()).toEqual(["d", "m"]);
  });

  it("keeps empty notebooks as empty groups", () => {
    const empty = makeNotebook({ id: "e", name: "Empty", context: "office" });
    const res = selectNotesByNotebook([], [empty], "office", "");
    expect(res.groups.map((g) => g.notebook.id)).toEqual(["e"]);
    expect(res.groups[0]?.notes).toEqual([]);
  });

  it("search by note title surfaces the containing notebook with only matching notes", () => {
    const work = makeNotebook({ id: "work", name: "Work", context: "office" });
    const hit = makeNote({ id: "h", title: "RTSP notes", notebookId: "work" });
    const miss = makeNote({ id: "x", title: "Groceries", notebookId: "work" });

    const res = selectNotesByNotebook([hit, miss], [work], "office", "rtsp");
    expect(res.searching).toBe(true);
    expect(res.groups.map((g) => g.notebook.id)).toEqual(["work"]);
    expect(res.groups[0]?.notes.map((n) => n.id)).toEqual(["h"]);
    expect(res.unfiled).toEqual([]);
  });

  it("search by notebook name surfaces the whole notebook (all its notes)", () => {
    const work = makeNotebook({ id: "work", name: "Work log", context: "office" });
    const reading = makeNotebook({ id: "rd", name: "Reading", context: "office" });
    const a = makeNote({ id: "a", title: "Groceries", notebookId: "work" });
    const b = makeNote({ id: "b", title: "Standup", notebookId: "work" });
    // Title matches "work" but lives in a non-name-matching notebook.
    const c = makeNote({ id: "c", title: "Worksheet", notebookId: "rd" });

    const res = selectNotesByNotebook([a, b, c], [work, reading], "office", "work");
    const workGroup = res.groups.find((g) => g.notebook.id === "work");
    const readingGroup = res.groups.find((g) => g.notebook.id === "rd");
    // Name hit → all of Work log's notes, even non-title-matching ones.
    expect(workGroup?.notes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    // Reading didn't name-match but contains a title hit → just that note.
    expect(readingGroup?.notes.map((n) => n.id)).toEqual(["c"]);
  });

  it("shows an empty name-matched notebook so it can be navigated", () => {
    const work = makeNotebook({ id: "w", name: "Work", context: "office" });
    const res = selectNotesByNotebook([], [work], "office", "work");
    expect(res.groups.map((g) => g.notebook.id)).toEqual(["w"]);
    expect(res.groups[0]?.notes).toEqual([]);
  });

  it("matches Unfiled notes by title while searching", () => {
    const loose = makeNote({ id: "l", title: "RTSP loose", notebookId: null });
    const res = selectNotesByNotebook([loose], [], "office", "rtsp");
    expect(res.searching).toBe(true);
    expect(res.unfiled.map((n) => n.id)).toEqual(["l"]);
  });
});

describe("reconcileNoteNotebook", () => {
  const work = makeNotebook({ id: "work", name: "Work", context: "office" });

  it("keeps a note filed in a same-context notebook", () => {
    const note = makeNote({ notebookId: "work", context: "office" });
    expect(reconcileNoteNotebook(note, [work])).toBe(note);
  });

  it("unfiles a note whose context diverged from its notebook", () => {
    const note = makeNote({ notebookId: "work", context: "personal" });
    expect(reconcileNoteNotebook(note, [work]).notebookId).toBeNull();
  });

  it("unfiles a note whose notebook no longer exists", () => {
    const note = makeNote({ notebookId: "ghost", context: "office" });
    expect(reconcileNoteNotebook(note, [work]).notebookId).toBeNull();
  });

  it("leaves an already-unfiled note untouched", () => {
    const note = makeNote({ notebookId: null });
    expect(reconcileNoteNotebook(note, [work])).toBe(note);
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

/* ------------------------------------------------- active-list ordering */

describe("priority → due → age ordering", () => {
  it("floats priority first, then soonest due, then oldest; undated last", () => {
    const flagged = makeTask({ id: "p", priority: true, created: "2026-06-06T09:00:00Z" });
    const dueSoon = makeTask({ id: "soon", due: "2026-06-08", created: "2026-06-06T09:00:00Z" });
    const dueLater = makeTask({ id: "later", due: "2026-06-20", created: "2026-06-01T09:00:00Z" });
    const undated = makeTask({ id: "old", created: "2026-05-01T09:00:00Z" });

    const view = selectToday([undated, dueLater, dueSoon, flagged], "office", NOW);
    expect(view.office.map((t) => t.id)).toEqual(["p", "soon", "later", "old"]);
  });
});
