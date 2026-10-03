import type { SyncStatus } from "./types";

/** "just now", "2 min ago", "3 h ago", "5 d ago" for an ISO time. */
export function ago(iso: string, now: Date = new Date()): string {
  const min = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.floor(min / 60)} h ago`;
  return `${Math.floor(min / 1440)} d ago`;
}

/** "under 1 s", "12 s", "3 min" for a duration in ms. */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 1) return "under 1 s";
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

/** The one plain-language line describing what sync is doing, for Settings and the indicator tooltip. */
export function statusLine(s: SyncStatus, now: Date = new Date()): string {
  switch (s.phase) {
    case "syncing": {
      const p = s.progress;
      if (!p) return "Syncing…";
      // Time left extrapolates the average so far; nothing to go on until a file lands.
      const left = p.done > 0 ? ((now.getTime() - p.startedAt) / p.done) * (p.total - p.done) : null;
      return `Syncing ${p.done} of ${p.total}${left === null ? "" : ` · about ${duration(left)} left`}`;
    }
    case "idle": {
      if (!s.lastSyncedAt) return "Connected. Not synced yet.";
      const r = s.lastRun;
      const took = r ? ` · ${r.files} ${r.files === 1 ? "file" : "files"} in ${duration(r.ms)}` : "";
      return `Synced ${ago(s.lastSyncedAt, now)}${took}`;
    }
    default:
      return s.message ?? "Not connected";
  }
}
