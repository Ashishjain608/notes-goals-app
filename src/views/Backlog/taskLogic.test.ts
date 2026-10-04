import { describe, expect, it, vi } from "vitest";
import type { Task } from "@/types";

const state = vi.hoisted(() => ({
  slateCap: 5,
  showUndo: vi.fn(),
  toggleTaskCommit: vi.fn(async () => false),
}));
vi.mock("@/store", () => ({ useStore: { getState: () => state } }));

import { matchesChips, metaLine, toggleCommitWithUndo } from "./taskLogic";

const NOW = new Date(2026, 9, 4, 12);
const task = (o: Partial<Task> = {}): Task => ({
  id: "t", title: "T", details: "", status: "open", context: "office", priority: false,
  due: null, snoozeUntil: null, goalId: null, committedOn: null, subtasks: [], attachments: [],
  created: "2026-10-01T00:00:00Z", completed: null, ...o,
}) as Task;

describe("matchesChips", () => {
  it("passes everything with no chips", () => expect(matchesChips(task(), [], NOW)).toBe(true));
  it("due soon: overdue or within a week, not later or none", () => {
    expect(matchesChips(task({ due: "2026-10-02" }), ["due"], NOW)).toBe(true);
    expect(matchesChips(task({ due: "2026-10-11" }), ["due"], NOW)).toBe(true);
    expect(matchesChips(task({ due: "2026-10-12" }), ["due"], NOW)).toBe(false);
    expect(matchesChips(task(), ["due"], NOW)).toBe(false);
  });
  it("snoozed and goal", () => {
    expect(matchesChips(task({ snoozeUntil: "2026-10-09" }), ["snoozed"], NOW)).toBe(true);
    expect(matchesChips(task(), ["snoozed"], NOW)).toBe(false);
    expect(matchesChips(task({ goalId: "g" }), ["goal"], NOW)).toBe(true);
  });
  it("context chips filter by context; chips combine with AND", () => {
    expect(matchesChips(task({ context: "personal" }), ["office"], NOW)).toBe(false);
    expect(matchesChips(task({ goalId: "g", context: "personal" }), ["goal", "personal"], NOW)).toBe(true);
    expect(matchesChips(task({ context: "personal" }), ["goal", "personal"], NOW)).toBe(false);
  });
});

describe("metaLine", () => {
  it("is empty with nothing to say", () => expect(metaLine(task(), null, "2026-10-04", NOW)).toEqual({ text: "", overdue: false }));
  it("joins on-today, due and goal, flagging overdue", () => {
    const m = metaLine(task({ due: "2026-10-02", committedOn: "2026-10-04", goalId: "g" }), { title: "Launch" } as never, "2026-10-04", NOW);
    expect(m).toEqual({ text: "On today · 2d overdue · Launch", overdue: true });
  });
});

describe("toggleCommitWithUndo", () => {
  it("shows an info toast without Undo when the slate is full", async () => {
    state.showUndo.mockClear();
    await toggleCommitWithUndo(task(), false);
    expect(state.showUndo).toHaveBeenCalledWith({ label: "Slate is full (5 of 5)" });
  });
  it("offers Undo after a successful commit", async () => {
    state.showUndo.mockClear();
    state.toggleTaskCommit.mockResolvedValueOnce(true);
    await toggleCommitWithUndo(task(), false);
    expect(state.showUndo.mock.calls[0]?.[0].undo).toBeTypeOf("function");
  });
});
