import { describe, expect, it } from "vitest";
import {
  ageInDays,
  dueLabel,
  isCompletedToday,
  isSnoozed,
  localToday,
} from "./dates";

// Tests are timezone-INDEPENDENT: scenarios are built from local Date components
// and round-tripped through toISOString(), so they pass under any runner TZ.

const at = (y: number, mo: number, d: number, h = 9, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe("ageInDays", () => {
  it("is 0 for something created today", () => {
    expect(ageInDays(at(2026, 6, 6).toISOString(), at(2026, 6, 6, 18))).toBe(0);
  });
  it("counts whole local days", () => {
    expect(ageInDays(at(2026, 6, 1).toISOString(), at(2026, 6, 6))).toBe(5);
  });
  it("never goes negative", () => {
    expect(ageInDays(at(2026, 6, 10).toISOString(), at(2026, 6, 6))).toBe(0);
  });
});

describe("isSnoozed (inclusive 'until')", () => {
  it("is hidden when snoozeUntil is after today", () => {
    expect(isSnoozed("2026-06-10", at(2026, 6, 6))).toBe(true);
  });
  it("reappears exactly on the snoozeUntil day", () => {
    expect(isSnoozed("2026-06-06", at(2026, 6, 6))).toBe(false);
  });
  it("is not snoozed when null", () => {
    expect(isSnoozed(null, at(2026, 6, 6))).toBe(false);
  });
});

describe("isCompletedToday (local day, ADR-0004 late-night case)", () => {
  it("counts a late-night completion as today even when UTC rolled over", () => {
    const now = at(2026, 6, 6, 23, 0); // 11pm local June 6
    const completed = at(2026, 6, 6, 23, 30).toISOString(); // stored UTC may be June 7
    expect(isCompletedToday(completed, now)).toBe(true);
  });
  it("is false for yesterday's completion", () => {
    expect(isCompletedToday(at(2026, 6, 5, 10).toISOString(), at(2026, 6, 6, 10))).toBe(false);
  });
});

describe("dueLabel buckets", () => {
  const now = at(2026, 6, 6);
  it("overdue", () => expect(dueLabel("2026-06-04", now)).toEqual({ text: "2d overdue", tone: "overdue" }));
  it("today", () => expect(dueLabel("2026-06-06", now)?.tone).toBe("soon"));
  it("tomorrow", () => expect(dueLabel("2026-06-07", now)?.text).toBe("Due tomorrow"));
  it("within a week", () => expect(dueLabel("2026-06-09", now)?.text).toBe("Due in 3d"));
  it("further out shows a date", () => expect(dueLabel("2026-07-01", now)?.text).toContain("Due "));
  it("null → null", () => expect(dueLabel(null, now)).toBeNull());
});

describe("localToday", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(localToday(at(2026, 6, 6))).toBe("2026-06-06");
  });
});
