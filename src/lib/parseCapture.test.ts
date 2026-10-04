import { describe, expect, it } from "vitest";
import { parseCapture } from "./parseCapture";

// now = Sunday 4 Oct 2026, local noon. All expectations are local-day keys.
const now = new Date(2026, 9, 4, 12);
const goals = [
  { id: "g1", title: "Q3 board deck", status: "active" as const },
  { id: "g2", title: "Q3 board", status: "onhold" as const },
  { id: "g3", title: "Quarterly taxes", status: "done" as const },
  { id: "g4", title: "Office move", status: "active" as const },
  { id: "g5", title: "Fitness", status: "active" as const },
];
const run = (t: string, n = now) => parseCapture(t, { now: n, goals });

describe("dates", () => {
  it.each([
    ["Pay rent today", "2026-10-04"],
    ["Call mum tonight", "2026-10-04"],
    ["Call mum TOMORROW", "2026-10-05"],
    ["Call mum tmrw", "2026-10-05"],
    ["Call mum tmr", "2026-10-05"],
    ["Gym friday", "2026-10-09"],
    ["Gym fri", "2026-10-09"],
    ["Gym on Fri", "2026-10-09"],
    ["Gym next friday", "2026-10-09"],
    ["Gym sunday", "2026-10-11"], // strictly after today
    ["Gym mon", "2026-10-05"],
    ["Plan next week", "2026-10-05"],
    ["Hike this weekend", "2026-10-10"],
    ["Hike weekend", "2026-10-10"],
    ["Ship in 3 days", "2026-10-07"],
    ["Ship in 1 day", "2026-10-05"],
    ["Ship in a day", "2026-10-05"],
    ["Ship in 2 weeks", "2026-10-18"],
    ["Ship in a week", "2026-10-11"],
    ["Ship in 365 days", "2027-10-04"],
    ["Dinner Oct 9", "2026-10-09"],
    ["Dinner October 9", "2026-10-09"],
    ["Dinner 9 Oct", "2026-10-09"],
    ["Dinner 9 October", "2026-10-09"],
    ["Dinner on 9th Oct", "2026-10-09"],
    ["Dinner Oct 22nd", "2026-10-22"],
    ["Dinner Oct 4", "2026-10-04"], // today stays this year
    ["Dinner Oct 3", "2027-10-03"], // passed -> next year
    ["Taxes Jan 3", "2027-01-03"],
    ["Taxes due friday", "2026-10-09"],
    ["Taxes due on Oct 9", "2026-10-09"],
    ["Taxes due tomorrow", "2026-10-05"],
    ["Ship v1 by Dec 1", "2026-12-01"],
  ])("%s -> %s", (text, due) => {
    expect(run(text).due).toBe(due);
  });

  it("weekend is today on a Saturday", () => {
    expect(run("Hike weekend", new Date(2026, 9, 3, 9)).due).toBe("2026-10-03");
  });

  it("crosses a DST change by calendar days", () => {
    expect(run("Ship in 3 days", new Date(2026, 2, 28)).due).toBe("2026-03-31");
  });

  it("first date wins; later date phrases stay in the title", () => {
    const r = run("Move tomorrow or friday");
    expect(r.due).toBe("2026-10-05");
    expect(r.title).toBe("Move or friday");
    expect(r.tokens).toHaveLength(1);
  });

  it.each([
    "Mondays are rough",
    "Check today's news",
    "Dinner Feb 30",
    "Ship in 0 days",
    "Ship in 366 days",
    "Buy tomorrowland tickets",
    "Read #friday",
    "Dinner Oct 123",
  ])("no date in %s", (text) => {
    expect(run(text).due).toBeNull();
  });

  it("invalid month-day is left in the title, later valid date still found", () => {
    const r = run("Feb 30 party tomorrow");
    expect(r.due).toBe("2026-10-05");
    expect(r.title).toBe("Feb 30 party");
  });
});

describe("context", () => {
  it("Renew passport tomorrow #personal", () => {
    const r = run("Renew passport tomorrow #personal");
    expect(r).toMatchObject({
      title: "Renew passport",
      due: "2026-10-05",
      context: "personal",
      goalId: null,
    });
  });
  it("is case-insensitive", () => {
    expect(run("Email Bob #OFFICE").context).toBe("office");
  });
  it("#officehours is not a context", () => {
    const r = run("Email Bob #officehours");
    expect(r.context).toBeNull();
    expect(r.title).toBe("Email Bob #officehours");
  });
});

describe("goal", () => {
  it.each([
    ["Draft #q3-board", "g2"], // shortest title among prefix matches
    ["Draft #q3", "g2"],
    ["Draft #q3_board_deck", "g1"],
    ["Draft #Q3-BOARD-DECK", "g1"],
    ["Draft #fit", "g5"],
    ["Draft #officehours", null],
    ["Draft #office-m", "g4"],
  ])("%s -> %s", (text, id) => {
    expect(run(text).goalId).toBe(id);
  });

  it("ignores done goals and leaves unmatched hashtags in the title", () => {
    const r = run("Pay #quarterly now");
    expect(r.goalId).toBeNull();
    expect(r.tokens).toEqual([]);
    expect(r.title).toBe("Pay #quarterly now");
  });

  it("goal and context combine", () => {
    const r = run("Slides #fitness #personal tmrw");
    expect(r).toMatchObject({ title: "Slides", goalId: "g5", context: "personal", due: "2026-10-05" });
  });

  it("works without goals", () => {
    expect(parseCapture("x #q3", { now }).goalId).toBeNull();
  });
});

describe("tokens", () => {
  it("offsets slice the original text, sorted by start", () => {
    const text = "Renew  passport #personal due on Fri";
    const r = run(text);
    expect(r.tokens.map((t) => t.kind)).toEqual(["context", "date"]);
    for (const t of r.tokens) expect(text.slice(t.start, t.end)).toBe(t.text);
    expect(r.tokens[1]!.text).toBe("due on Fri");
    expect(r.title).toBe("Renew passport");
  });

  it("'by' before a date belongs to the date", () => {
    expect(run("Ship v1 by Dec 1").title).toBe("Ship v1");
    expect(run("Stand by me").title).toBe("Stand by me");
    expect(run("Drive-by Friday review").title).toBe("Drive-by review");
  });

  it("title may be empty", () => {
    expect(run("tomorrow").title).toBe("");
  });

  it("plain text passes through", () => {
    expect(run("  Buy   milk ")).toMatchObject({ title: "Buy milk", due: null, tokens: [] });
  });
});
