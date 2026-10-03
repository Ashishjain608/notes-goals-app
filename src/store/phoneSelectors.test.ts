/** Tests for the phone-only selectors (ADR-0012). Fixed local `now`; selectors are pure. */

import { describe, expect, it } from "vitest";
import type { Goal, Task } from "@/types";
import { selectBacklogByGoal, selectGoalNext, selectGoalSections } from "./selectors";

const NOW = new Date(2026, 9, 4, 12);

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    context: "office",
    status: "open",
    created: "2026-10-01T09:00:00Z",
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

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  seq += 1;
  return {
    id: `g${seq}`,
    title: `Goal ${seq}`,
    description: "",
    context: "office",
    status: "active",
    target: null,
    created: "2026-10-01T09:00:00Z",
    updated: "2026-10-01T09:00:00Z",
    ...overrides,
  };
}

describe("selectBacklogByGoal", () => {
  const gA = makeGoal({ id: "A" });
  const gB = makeGoal({ id: "B" });

  it("returns [] for empty input", () => {
    expect(selectBacklogByGoal([], [gA], [])).toEqual([]);
  });

  it("orders groups by first appearance, keeps row order, no-goal last, omits empty", () => {
    const a1 = makeTask({ goalId: "A" });
    const n1 = makeTask({ goalId: null });
    const b1 = makeTask({ goalId: "B" });
    const a2 = makeTask({ goalId: "A" });
    const groups = selectBacklogByGoal([b1, n1, a1, a2], [gA, gB], []);
    expect(groups.map((g) => g.goal?.id ?? null)).toEqual(["B", "A", null]);
    expect(groups[1]?.tasks).toEqual([a1, a2]);
    const only = selectBacklogByGoal([n1, b1], [gA, gB], []);
    expect(only.map((g) => g.goal?.id ?? null)).toEqual(["B", null]);
  });

  it("puts null and dangling goalIds in the no-goal group with null progress", () => {
    const n = makeTask({ goalId: null });
    const d = makeTask({ goalId: "missing" });
    const groups = selectBacklogByGoal([d, n], [gA], []);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ goal: null, tasks: [d, n], progress: null });
  });

  it("computes progress from allTasks, not just rows", () => {
    const open = makeTask({ goalId: "A" });
    const done = makeTask({ goalId: "A", status: "done" });
    const [g] = selectBacklogByGoal([open], [gA], [open, done]);
    expect(g?.progress).toEqual({ done: 1, total: 2, pct: 50 });
  });
});

describe("selectGoalNext", () => {
  it("returns null when no open tasks", () => {
    expect(selectGoalNext("g", [makeTask({ goalId: "g", status: "done" })], NOW)).toBeNull();
    expect(selectGoalNext("g", [], NOW)).toBeNull();
  });

  it.each([
    ["after today", "2026-10-05", false],
    ["today", "2026-10-04", true],
    ["before today", "2026-10-03", true],
  ])("snoozeUntil %s -> returned=%s", (_l, snoozeUntil, returned) => {
    const t = makeTask({ goalId: "g", snoozeUntil });
    expect(selectGoalNext("g", [t], NOW)).toBe(returned ? t : null);
  });

  it("skips snoozed and respects priority-first ordering", () => {
    const snoozedPriority = makeTask({ goalId: "g", priority: true, snoozeUntil: "2026-10-09" });
    const plain = makeTask({ goalId: "g", due: "2026-10-02" });
    const priority = makeTask({ goalId: "g", priority: true });
    expect(selectGoalNext("g", [plain, snoozedPriority, priority], NOW)).toBe(priority);
    expect(selectGoalNext("g", [plain, snoozedPriority], NOW)).toBe(plain);
  });
});

describe("selectGoalSections", () => {
  const a2 = makeGoal({ id: "a2", target: "2026-12-01" });
  const a1 = makeGoal({ id: "a1", target: "2026-11-01" });
  const aNull = makeGoal({ id: "aNull" });
  const h1 = makeGoal({ id: "h1", status: "onhold", target: "2026-11-15" });
  const d1 = makeGoal({ id: "d1", status: "done" });
  const x1 = makeGoal({ id: "x1", status: "dropped" });
  const personal = makeGoal({ id: "p1", context: "personal" });
  const all = [aNull, a2, h1, d1, a1, x1, personal];
  const ids = (gs: Goal[]) => gs.map((g) => g.id);

  it("splits statuses, keeps target-ascending null-last order", () => {
    const s = selectGoalSections(all, "all");
    expect(ids(s.active)).toEqual(["a1", "a2", "aNull", "p1"]);
    expect(ids(s.onHold)).toEqual(["h1"]);
    expect(ids(s.closed)).toEqual(["d1", "x1"]);
  });

  it("applies the context filter", () => {
    const s = selectGoalSections(all, "personal");
    expect(ids(s.active)).toEqual(["p1"]);
    expect(s.onHold).toEqual([]);
    expect(s.closed).toEqual([]);
  });
});
