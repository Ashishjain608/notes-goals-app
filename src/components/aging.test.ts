import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import { computeAging } from "./aging";
import { toLocalDateKey } from "@/lib/dates";

/** Build a task whose `created` is `daysAgo` local days before now. */
function taskCreatedDaysAgo(daysAgo: number): Task {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  // Use a bare local date key so ageInDays sees exactly `daysAgo` whole days.
  const created = `${toLocalDateKey(d)}T12:00:00Z`;
  return {
    id: "t1",
    title: "x",
    context: "office",
    status: "open",
    created,
    due: null,
    snoozeUntil: null,
    completed: null,
    goalId: null,
    subtasks: [],
    details: "",
    priority: false,
  };
}

describe("computeAging", () => {
  it("labels a fresh task 'today' and uses muted ink", () => {
    const a = computeAging(taskCreatedDaysAgo(0), "noticeable");
    expect(a.n).toBe(0);
    expect(a.label).toBe("today");
    expect(a.colorClass).toBe("text-ink-3");
    expect(a.tintClass).toBeNull();
    expect(a.barW).toBe(0);
  });

  it("uses amber ink for aging tasks (>=3d) in noticeable mode, no tint", () => {
    const a = computeAging(taskCreatedDaysAgo(4), "noticeable");
    expect(a.label).toBe("4d");
    expect(a.colorClass).toBe("text-age-aging-ink");
    expect(a.tintClass).toBeNull();
  });

  it("uses red ink + heat tint for stale tasks (>=7d) in noticeable mode", () => {
    const a = computeAging(taskCreatedDaysAgo(9), "noticeable");
    expect(a.colorClass).toBe("text-age-stale-ink");
    expect(a.tintClass).toBe("age-stale-tint");
    expect(a.barColorClass).toBeNull();
    expect(a.barW).toBe(0);
  });

  it("subtle mode is muted only — never tints or bars", () => {
    const a = computeAging(taskCreatedDaysAgo(30), "subtle");
    expect(a.colorClass).toBe("text-ink-3");
    expect(a.tintClass).toBeNull();
    expect(a.barColorClass).toBeNull();
    expect(a.barW).toBe(0);
  });

  it("escalating mode grows a left bar capped at 3px and tints by tone", () => {
    expect(computeAging(taskCreatedDaysAgo(0), "escalating").barW).toBe(0);
    expect(computeAging(taskCreatedDaysAgo(4), "escalating").barW).toBe(1);
    expect(computeAging(taskCreatedDaysAgo(8), "escalating").barW).toBe(2);
    const old = computeAging(taskCreatedDaysAgo(40), "escalating");
    expect(old.barW).toBe(3);
    expect(old.barColorClass).toBe("bg-age-stale-bar");
    expect(old.tintClass).toBe("age-stale-tint");

    const aging = computeAging(taskCreatedDaysAgo(4), "escalating");
    expect(aging.barColorClass).toBe("bg-age-aging-ink");
    expect(aging.tintClass).toBe("bg-warn-soft");
  });
});
