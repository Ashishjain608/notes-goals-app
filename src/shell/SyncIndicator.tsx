/**
 * SyncIndicator — a small title-bar icon for Dropbox sync. Renders nothing
 * until Dropbox is connected, so the desktop look is unchanged without sync.
 * Its tooltip says exactly what is happening; clicking opens Settings.
 */
import { useEffect, useState, type JSX } from "react";
import { Icon, type IconName } from "@/components";
import { useStore } from "@/store";
import { statusLine } from "@/sync/format";
import type { SyncPhase } from "@/sync/types";

const ICON: Record<SyncPhase, IconName> = {
  off: "cloud",
  idle: "cloudCheck",
  syncing: "refresh",
  offline: "cloudOff",
  attention: "alert",
  error: "alert",
};

export function SyncIndicator(): JSX.Element | null {
  const sync = useStore((s) => s.sync);
  const openSettings = useStore((s) => s.openSettings);
  // "Synced 2 min ago" ages while nothing else re-renders.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (sync.phase === "off") return null;
  const needsYou = sync.phase === "attention" || sync.phase === "error";
  const label = `Dropbox: ${statusLine(sync)}${needsYou ? " Open Settings to fix it." : ""}`;
  return (
    <button
      type="button"
      onClick={openSettings}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-raise max-md:h-11 max-md:w-11 ${
        needsYou ? "text-warn-ink" : "text-ink-3 hover:text-ink-2"
      }`}
    >
      <Icon name={ICON[sync.phase]} size={18} className={sync.phase === "syncing" ? "animate-spin" : undefined} />
    </button>
  );
}
