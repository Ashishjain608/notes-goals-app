import { describe, expect, it } from "vitest";
import { ago, duration, statusLine } from "./format";

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
  it("progress, time left and the last run's figures", () => {
    const base = { account: null, lastSyncedAt: "2026-10-03T09:59:50Z", message: null };
    const started = NOW.getTime() - 10_000;
    expect(statusLine({ ...base, phase: "syncing", progress: { done: 0, total: 170, startedAt: started } }, NOW))
      .toBe("Syncing 0 of 170");
    expect(statusLine({ ...base, phase: "syncing", progress: { done: 40, total: 170, startedAt: started } }, NOW))
      .toBe("Syncing 40 of 170 · about 33 s left");
    expect(statusLine({ ...base, phase: "idle", lastRun: { files: 170, ms: 12_400 } }, NOW))
      .toBe("Synced just now · 170 files in 12 s");
    expect(statusLine({ ...base, phase: "idle", lastRun: { files: 1, ms: 300 } }, NOW))
      .toBe("Synced just now · 1 file in under 1 s");
    expect(duration(200_000)).toBe("3 min");
  });
});
