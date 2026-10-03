import { describe, expect, it } from "vitest";
import { ago, statusLine } from "./format";

const NOW = new Date("2026-10-03T10:00:00Z");
describe("sync wording", () => {
  it("ago", () => {
    expect(ago("2026-10-03T09:59:50Z", NOW)).toBe("just now");
    expect(ago("2026-10-03T09:58:00Z", NOW)).toBe("2 min ago");
    expect(ago("2026-10-03T07:00:00Z", NOW)).toBe("3 h ago");
  });
  it("statusLine", () => {
    const base = { account: null, lastSyncedAt: "2026-10-03T09:58:00Z", message: "x" };
    expect(statusLine({ ...base, phase: "idle" }, NOW)).toBe("Synced 2 min ago");
    expect(statusLine({ ...base, phase: "syncing" }, NOW)).toBe("Syncing…");
    expect(statusLine({ ...base, phase: "error" }, NOW)).toBe("x");
  });
});
