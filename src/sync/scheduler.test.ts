/** Scheduler and status mapping, against fakes and fake timers. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScheduler, statusForError, statusForResult, type StatusPatch } from "./scheduler";
import { AuthLostError, type SyncResult } from "./types";

const result = (p: Partial<SyncResult> = {}): SyncResult => ({
  uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, conflicts: 0, heldDeletes: 0, errors: [], ...p,
});
const AT = new Date("2026-10-03T10:00:00.000Z");

describe("status mapping", () => {
  it("clean run is idle with lastSyncedAt", () => {
    expect(statusForResult(result(), AT)).toEqual({ phase: "idle", lastSyncedAt: AT.toISOString(), message: null });
  });
  it("held deletes need attention", () => {
    const s = statusForResult(result({ heldDeletes: 12 }), AT);
    expect(s.phase).toBe("attention");
    expect(s.message).toBe("12 files are missing here, so they weren't deleted from Dropbox. Check your data folder.");
  });
  it("files that failed on their own make the run an error naming the first", () => {
    expect(statusForResult(result({ uploaded: 3, errors: ["tasks/b.json: too big"] }), AT)).toEqual({
      phase: "error", message: "1 file couldn't sync. tasks/b.json: too big",
    });
  });
  it("auth lost needs attention", () => {
    expect(statusForError(new AuthLostError(), true)).toEqual({
      phase: "attention", message: "Dropbox access was revoked. Connect again.",
    });
  });
  it("TypeError or navigator offline is offline", () => {
    expect(statusForError(new TypeError("Failed to fetch"), true).phase).toBe("offline");
    expect(statusForError(new Error("boom"), false).phase).toBe("offline");
  });
  it("anything else is an error with its message", () => {
    expect(statusForError(new Error("Dropbox 500: x"), true)).toEqual({ phase: "error", message: "Dropbox 500: x" });
  });
});

describe("scheduler", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  function setup(run = vi.fn(async () => result()), over: { savePending?: () => boolean; online?: boolean } = {}) {
    const statuses: StatusPatch[] = [];
    const reload = vi.fn(async () => {});
    const s = createScheduler({
      run, reload,
      setStatus: (p) => statuses.push(p),
      savePending: over.savePending ?? (() => false),
      isOnline: () => over.online ?? true,
      now: () => AT,
    });
    return { s, run, reload, statuses };
  }

  it("debounces a burst of requests into one run after 3 s", async () => {
    const { s, run } = setup();
    s.request(); s.request(); s.request();
    await vi.advanceTimersByTimeAsync(2999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("heartbeat runs every 60 s until stopped", async () => {
    const { s, run } = setup();
    s.start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(2);
    s.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("single-flight: requests during a run cause exactly one more run", async () => {
    let release!: () => void;
    const run = vi.fn(() => new Promise<SyncResult>((r) => (release = () => r(result()))));
    const { s } = setup(run);
    const first = s.runNow();
    void s.runNow(); void s.runNow();
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    release();
    await first;
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reloads the store after downloads, and retries once if a save was pending", async () => {
    const { s, reload } = setup(vi.fn(async () => result({ downloaded: 2 })), { savePending: () => true });
    await s.runNow();
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when nothing came down", async () => {
    const { s, reload } = setup(vi.fn(async () => result({ uploaded: 3 })));
    await s.runNow();
    expect(reload).not.toHaveBeenCalled();
  });

  it("maps failures to status and stops the heartbeat when access is revoked", async () => {
    const { s, run, statuses } = setup(vi.fn(async () => { throw new AuthLostError(); }));
    s.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(statuses.at(-1)?.phase).toBe("attention");
    await vi.advanceTimersByTimeAsync(180_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("publishes progress, then how many files moved and how long it took", async () => {
    let clock = AT.getTime();
    const statuses: StatusPatch[] = [];
    const run = vi.fn(async (onProgress: (done: number, total: number) => void) => {
      onProgress(0, 3);
      clock += 1500;
      onProgress(3, 3);
      return result({ downloaded: 3 });
    });
    const s = createScheduler({
      run, reload: async () => {}, savePending: () => false, isOnline: () => true,
      setStatus: (p) => statuses.push(p),
      now: () => new Date(clock),
    });
    await s.runNow();
    expect(statuses[1]).toEqual({ progress: { done: 0, total: 3, startedAt: AT.getTime() } });
    expect(statuses.at(-1)).toMatchObject({ phase: "idle", progress: null, lastRun: { files: 3, ms: 1500 } });

    // A run with nothing to move leaves the last figures alone.
    run.mockImplementation(async () => result());
    await s.runNow();
    expect(statuses.at(-1)).not.toHaveProperty("lastRun");
  });

  it("goes offline without calling the network when navigator is offline", async () => {
    const { s, run, statuses } = setup(undefined, { online: false });
    await s.runNow();
    expect(run).not.toHaveBeenCalled();
    expect(statuses.at(-1)?.phase).toBe("offline");
  });
});
