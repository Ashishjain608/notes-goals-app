/**
 * MoreSheet — the phone's "More" bottom sheet: context filter, Activity,
 * Settings, theme and Dropbox sync. Opened via `phoneOverlay = {kind:"more"}`.
 */
import { useEffect, useState, type JSX } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Icon, type IconName } from "@/components";
import { usePhoneLayer } from "@/lib/phoneHistory";
import { useStore } from "@/store";
import { statusLine } from "@/sync/format";
import type { ContextFilter } from "@/types";

const SEGMENTS: { value: ContextFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
];

const ROW = "flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-[16px] text-ink active:bg-raise";

function Row({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onClick} className={ROW}>
      <span className="text-ink-2">
        <Icon name={icon} size={20} />
      </span>
      {label}
    </button>
  );
}

export function MoreSheet(): JSX.Element {
  const open = useStore((s) => s.phoneOverlay?.kind === "more");
  const setPhoneOverlay = useStore((s) => s.setPhoneOverlay);
  const contextFilter = useStore((s) => s.contextFilter);
  const setContextFilter = useStore((s) => s.setContextFilter);
  const navigate = useStore((s) => s.navigate);
  const openSettings = useStore((s) => s.openSettings);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const sync = useStore((s) => s.sync);
  const syncNow = useStore((s) => s.syncNow);

  const close = () => setPhoneOverlay(null);
  usePhoneLayer("more", open, close);

  // "Synced 2 min ago" ages while nothing else re-renders.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const needsYou = sync.phase === "attention" || sync.phase === "error";
  const syncing = sync.phase === "syncing";

  return (
    <BottomSheet open={open} onClose={close} title="More">
      <div className="flex flex-col gap-1 pb-2">
        <div className="px-1 pb-1 text-[13px] font-semibold uppercase tracking-[.06em] text-ink-2">Show</div>
        <div className="mb-2 flex h-12 rounded-3xl bg-ink-6 p-[2px]">
          {SEGMENTS.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={contextFilter === s.value}
              onClick={() => setContextFilter(s.value)}
              className={`h-11 flex-1 rounded-[22px] text-[15px] ${
                contextFilter === s.value ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-2"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Row
          icon="clock"
          label="Activity"
          onClick={() => {
            navigate("activity");
            close();
          }}
        />
        <Row
          icon="settings"
          label="Settings"
          onClick={() => {
            close();
            openSettings();
          }}
        />
        <Row
          icon={theme === "light" ? "moon" : "sun"}
          label={theme === "light" ? "Dark mode" : "Light mode"}
          onClick={toggleTheme}
        />
        {sync.phase === "off" ? (
          <Row
            icon="cloud"
            label="Sync with Dropbox"
            onClick={() => {
              close();
              openSettings();
            }}
          />
        ) : (
          <div className="mt-2 flex flex-col items-start gap-2 px-3">
            <div className="text-[15px] text-ink">Dropbox · {statusLine(sync)}</div>
            {needsYou && sync.message && <div className="text-[14px] text-warn-ink">{sync.message}</div>}
            <button
              type="button"
              disabled={syncing}
              onClick={() => void syncNow()}
              className="h-11 rounded-full bg-accent-soft px-5 text-[15px] font-semibold text-accent-ink disabled:opacity-60"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
