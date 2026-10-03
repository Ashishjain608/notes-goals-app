/**
 * When to sync and what the result means (docs/adr/0011). Pure of Dropbox,
 * storage and the DOM: everything it touches comes in through SchedulerDeps,
 * so it is unit-tested with fakes and fake timers.
 */
import { AuthLostError, type SyncResult, type SyncStatus } from "./types";

export type StatusPatch = Partial<Pick<SyncStatus, "phase" | "lastSyncedAt" | "message" | "progress" | "lastRun">>;

/** Status after a failed run. */
export function statusForError(error: unknown, online: boolean): StatusPatch {
  if (error instanceof AuthLostError) {
    return { phase: "attention", message: "Dropbox access was revoked. Connect again." };
  }
  // fetch() rejects with a TypeError when the network is unreachable.
  if (error instanceof TypeError || !online) {
    return { phase: "offline", message: "You're offline. Changes sync when you're back online." };
  }
  return { phase: "error", message: error instanceof Error ? error.message : String(error) };
}

/** Status after a run that finished. */
export function statusForResult(result: SyncResult, at: Date): StatusPatch {
  if (result.heldDeletes > 0) {
    return {
      phase: "attention",
      message: `${result.heldDeletes} files are missing here, so they weren't deleted from Dropbox. Check your data folder.`,
    };
  }
  if (result.errors.length > 0) {
    const n = result.errors.length;
    return { phase: "error", message: `${n} ${n === 1 ? "file" : "files"} couldn't sync. ${result.errors[0]}` };
  }
  return { phase: "idle", lastSyncedAt: at.toISOString(), message: null };
}

export interface SchedulerDeps {
  /** One sync cycle (syncOnce wired to this platform). */
  run: (onProgress: (done: number, total: number) => void) => Promise<SyncResult>;
  setStatus: (patch: StatusPatch) => void;
  /** The store's reload(); it refuses while a save is in flight. */
  reload: () => Promise<void>;
  savePending: () => boolean;
  isOnline: () => boolean;
  now?: () => Date;
  debounceMs?: number;
  intervalMs?: number;
  reloadRetryMs?: number;
}

export interface Scheduler {
  /** Begin the 60 s heartbeat. */
  start(): void;
  stop(): void;
  /** Sync soon: debounced, so a burst of saves is one run. */
  request(): void;
  /** Sync now. During a run it queues exactly one more run afterwards. */
  runNow(): Promise<void>;
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  const now = deps.now ?? (() => new Date());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let current: Promise<void> | null = null;
  let again = false;

  const reloadAfter = async (r: SyncResult): Promise<void> => {
    if (r.downloaded + r.deletedLocal === 0) return;
    const wasSaving = deps.savePending();
    await deps.reload();
    if (wasSaving) setTimeout(() => void deps.reload(), deps.reloadRetryMs ?? 2000);
  };

  const once = async (): Promise<void> => {
    if (!deps.isOnline()) return deps.setStatus(statusForError(new Error("offline"), false));
    deps.setStatus({ phase: "syncing", message: null, progress: null });
    const began = now().getTime();
    const run = { files: 0, startedAt: 0 };
    try {
      const result = await deps.run((done, total) => {
        if (!run.files) run.startedAt = now().getTime();
        run.files = total;
        deps.setStatus({ progress: { done, total, startedAt: run.startedAt } });
      });
      deps.setStatus({
        ...statusForResult(result, now()),
        progress: null,
        // A run that moved nothing keeps the previous figures on screen.
        ...(run.files > 0 && { lastRun: { files: run.files, ms: now().getTime() - began } }),
      });
      await reloadAfter(result);
    } catch (e) {
      deps.setStatus({ ...statusForError(e, deps.isOnline()), progress: null });
      if (e instanceof AuthLostError) api.stop(); // nothing to retry until the user reconnects
    }
  };

  const api: Scheduler = {
    start() {
      if (!heartbeat) heartbeat = setInterval(() => void api.runNow(), deps.intervalMs ?? 60_000);
    },
    stop() {
      if (heartbeat) clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
      heartbeat = timer = null;
    },
    request() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void api.runNow();
      }, deps.debounceMs ?? 3000);
    },
    runNow() {
      if (current) {
        again = true;
        return current;
      }
      current = (async () => {
        try {
          do {
            again = false;
            await once();
          } while (again);
        } finally {
          current = null;
        }
      })();
      return current;
    },
  };
  return api;
}
