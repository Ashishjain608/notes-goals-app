// @vitest-environment node
// Pure-function tests only — no rendering needed (no jsdom in this repo).
import { describe, expect, it } from "vitest";
import { monthGrid, isDayDisabled } from "./DatePicker";

/** Days actually in `year`/`month` (0-based month), via JS Date rollover. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

describe("monthGrid", () => {
  it("always returns exactly 42 cells (6 weeks x 7 days)", () => {
    expect(monthGrid(2026, 5).length).toBe(42);
  });

  it("starts the grid on a Sunday and ends on a Saturday", () => {
    const grid = monthGrid(2026, 5);
    expect(new Date(`${grid[0]!.key}T00:00:00`).getDay()).toBe(0);
    expect(new Date(`${grid[41]!.key}T00:00:00`).getDay()).toBe(6);
  });

  it("marks exactly the correct number of in-month days for a 30-day month (June 2026)", () => {
    const grid = monthGrid(2026, 5); // June (0-based)
    const inMonth = grid.filter((d) => d.inMonth);
    expect(inMonth.length).toBe(30);
    expect(inMonth[0]!.day).toBe(1);
    expect(inMonth[inMonth.length - 1]!.day).toBe(30);
  });

  it("marks exactly the correct number of in-month days for a 31-day month (July 2026)", () => {
    const grid = monthGrid(2026, 6); // July
    const inMonth = grid.filter((d) => d.inMonth);
    expect(inMonth.length).toBe(31);
  });

  it("handles February in a leap year (2024 -> 29 days)", () => {
    const grid = monthGrid(2024, 1);
    expect(grid.filter((d) => d.inMonth).length).toBe(29);
  });

  it("handles February in a non-leap year (2026 -> 28 days)", () => {
    const grid = monthGrid(2026, 1);
    expect(grid.filter((d) => d.inMonth).length).toBe(28);
  });

  it("first in-month cell is always day 1, matching the real calendar", () => {
    for (let month = 0; month < 12; month++) {
      const grid = monthGrid(2026, month);
      const firstInMonth = grid.find((d) => d.inMonth);
      expect(firstInMonth?.day).toBe(1);
    }
  });

  it("last in-month cell matches the actual last day of the month", () => {
    for (let month = 0; month < 12; month++) {
      const grid = monthGrid(2026, month);
      const inMonth = grid.filter((d) => d.inMonth);
      expect(inMonth[inMonth.length - 1]!.day).toBe(daysInMonth(2026, month));
    }
  });

  it("leading/trailing days belong to the adjacent month and are marked out-of-month", () => {
    const grid = monthGrid(2026, 5); // June 2026: June 1 is a Monday
    // Cell 0 is the Sunday before June 1 -> May 31
    expect(grid[0]!.inMonth).toBe(false);
    expect(grid[0]!.key).toBe("2026-05-31");
  });

  it("produces no UTC off-by-one: every key's parsed local day matches its `day` field", () => {
    for (const month of [0, 5, 11]) {
      const grid = monthGrid(2026, month);
      for (const cell of grid) {
        const parts = cell.key.split("-").map(Number);
        expect(parts[2]).toBe(cell.day);
      }
    }
  });

  it("produces 42 contiguous calendar days with no gaps or duplicates (DST spring-forward month, March 2026)", () => {
    const grid = monthGrid(2026, 2); // March 2026 (US DST starts Mar 8, 2026)
    const keys = grid.map((d) => d.key);
    expect(new Set(keys).size).toBe(42);
    for (let i = 1; i < grid.length; i++) {
      const prev = new Date(`${grid[i - 1]!.key}T00:00:00`);
      const cur = new Date(`${grid[i]!.key}T00:00:00`);
      expect((cur.getTime() - prev.getTime()) / 86_400_000).toBe(1);
    }
  });

  it("produces 42 contiguous calendar days with no gaps or duplicates (DST fall-back month, November 2026)", () => {
    const grid = monthGrid(2026, 10); // November 2026 (US DST ends Nov 1, 2026)
    const keys = grid.map((d) => d.key);
    expect(new Set(keys).size).toBe(42);
    for (let i = 1; i < grid.length; i++) {
      const prev = new Date(`${grid[i - 1]!.key}T00:00:00`);
      const cur = new Date(`${grid[i]!.key}T00:00:00`);
      expect((cur.getTime() - prev.getTime()) / 86_400_000).toBe(1);
    }
  });

  it("rolls over correctly across a year boundary (December 2025 -> January days trail into it)", () => {
    const grid = monthGrid(2025, 11); // December 2025 (Dec 1 is a Monday)
    expect(grid[0]!.key).toBe("2025-11-30");
    const inMonth = grid.filter((d) => d.inMonth);
    expect(inMonth[inMonth.length - 1]!.key).toBe("2025-12-31");
  });
});

describe("isDayDisabled", () => {
  it("is not disabled with no bounds", () => {
    expect(isDayDisabled("2026-06-15")).toBe(false);
  });

  it("disables days strictly before min", () => {
    expect(isDayDisabled("2026-06-14", "2026-06-15")).toBe(true);
  });

  it("does not disable min itself (inclusive lower bound)", () => {
    expect(isDayDisabled("2026-06-15", "2026-06-15")).toBe(false);
  });

  it("disables days strictly after max", () => {
    expect(isDayDisabled("2026-06-16", undefined, "2026-06-15")).toBe(true);
  });

  it("does not disable max itself (inclusive upper bound)", () => {
    expect(isDayDisabled("2026-06-15", undefined, "2026-06-15")).toBe(false);
  });

  it("applies both bounds together", () => {
    expect(isDayDisabled("2026-06-10", "2026-06-01", "2026-06-20")).toBe(false);
    expect(isDayDisabled("2026-05-31", "2026-06-01", "2026-06-20")).toBe(true);
    expect(isDayDisabled("2026-06-21", "2026-06-01", "2026-06-20")).toBe(true);
  });
});
