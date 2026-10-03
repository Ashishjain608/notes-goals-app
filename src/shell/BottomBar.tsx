/**
 * BottomBar — the phone's navigation (replaces the NavRail below 768px).
 *
 * Four tabs (Today, Tasks, Goals, Notes) plus "More", a small sheet holding
 * Activity, Search (opens the command palette, since ⌘K doesn't exist on a
 * phone) and Settings. Every tab is icon + label, ≥ 56px tall, and the bar
 * pads for the iOS home indicator via env(safe-area-inset-bottom).
 */
import { useState, type JSX } from "react";
import { Icon, type IconName } from "@/components";
import { useStore, type Screen } from "@/store";

const TABS: { screen: Screen; label: string; icon: IconName }[] = [
  { screen: "today", label: "Today", icon: "today" },
  { screen: "tasks", label: "Tasks", icon: "tasks" },
  { screen: "goals", label: "Goals", icon: "goals" },
  { screen: "notes", label: "Notes", icon: "notes" },
];

function TabButton({
  icon,
  label,
  on,
  onClick,
  expanded,
}: {
  icon: IconName;
  label: string;
  on: boolean;
  onClick: () => void;
  expanded?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? "page" : undefined}
      aria-expanded={expanded}
      className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 ${
        on ? "text-accent-ink" : "text-ink-3"
      }`}
    >
      <Icon name={icon} size={22} />
      <span className={`text-[11px] ${on ? "font-semibold" : "font-medium"}`}>{label}</span>
    </button>
  );
}

/** The sheet behind the More tab. */
function MoreSheet({ onClose }: { onClose: () => void }): JSX.Element {
  const navigate = useStore((s) => s.navigate);
  const openPalette = useStore((s) => s.openPalette);
  const openSettings = useStore((s) => s.openSettings);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  const rows: { icon: IconName; label: string; run: () => void }[] = [
    { icon: "clock", label: "Activity", run: () => navigate("activity") },
    { icon: "search", label: "Search", run: openPalette },
    { icon: "settings", label: "Settings", run: openSettings },
    {
      icon: theme === "light" ? "moon" : "sun",
      label: theme === "light" ? "Dark mode" : "Light mode",
      run: toggleTheme,
    },
  ];

  return (
    <>
      <div
        onClick={onClose}
        className="ng-overlay-in fixed inset-0 z-40 bg-[rgba(20,18,15,.28)]"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="More"
        className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-[41] rounded-t-xl border border-b-0 border-line bg-surface p-2 shadow"
      >
        {rows.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => {
              onClose();
              r.run();
            }}
            className="flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-ink active:bg-raise"
          >
            <span className="text-ink-3">
              <Icon name={r.icon} size={20} />
            </span>
            {r.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** The phone tab bar. */
export function BottomBar(): JSX.Element {
  const screen = useStore((s) => s.route.screen);
  const navigate = useStore((s) => s.navigate);
  const [moreOpen, setMoreOpen] = useState(false);

  const active: Screen = screen === "goal" ? "goals" : screen;
  const moreActive = active === "activity";

  return (
    <>
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
      <nav
        aria-label="Primary"
        className="relative z-30 flex shrink-0 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map((t) => (
          <TabButton
            key={t.screen}
            icon={t.icon}
            label={t.label}
            on={active === t.screen}
            onClick={() => {
              setMoreOpen(false);
              navigate(t.screen);
            }}
          />
        ))}
        <TabButton
          icon="more"
          label="More"
          on={moreActive || moreOpen}
          expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
        />
      </nav>
    </>
  );
}
