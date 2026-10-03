import type { SyncStatus } from "./types";

/** "just now", "2 min ago", "3 h ago", "5 d ago" for an ISO time. */
export function ago(iso: string, now: Date = new Date()): string {
  const min = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.floor(min / 60)} h ago`;
  return `${Math.floor(min / 1440)} d ago`;
}

/** The one plain-language line describing what sync is doing, for Settings and the indicator tooltip. */
export function statusLine(s: SyncStatus, now: Date = new Date()): string {
  switch (s.phase) {
    case "syncing":
      return "Syncing…";
    case "idle":
      return s.lastSyncedAt ? `Synced ${ago(s.lastSyncedAt, now)}` : "Connected. Not synced yet.";
    default:
      return s.message ?? "Not connected";
  }
}
