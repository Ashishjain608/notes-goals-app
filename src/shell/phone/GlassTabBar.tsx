/**
 * GlassTabBar — the phone's floating bottom row: a glass pill with the four
 * tabs plus a round Search button. Fixed above the iOS home indicator.
 */
import type { JSX } from "react";
import { Icon, type IconName } from "@/components";
import { useStore, type Screen } from "@/store";

const TABS: { screen: Screen; label: string; icon: IconName }[] = [
  { screen: "today", label: "Today", icon: "today" },
  { screen: "tasks", label: "Tasks", icon: "tasks" },
  { screen: "notes", label: "Notes", icon: "notes" },
  { screen: "goals", label: "Goals", icon: "goals" },
];

export function GlassTabBar(): JSX.Element {
  const screen = useStore((s) => s.route.screen);
  const navigate = useStore((s) => s.navigate);
  const openPalette = useStore((s) => s.openPalette);
  const setPhoneOverlay = useStore((s) => s.setPhoneOverlay);
  const current = screen === "goal" ? "goals" : screen;

  return (
    <div
      className="fixed left-3 right-3 z-30 flex gap-[10px]"
      style={{ bottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <nav
        aria-label="Primary"
        className="flex h-[52px] flex-1 gap-[2px] rounded-[26px] bg-glass p-[2px] shadow-glass backdrop-blur-[20px]"
      >
        {TABS.map((t) => {
          const on = current === t.screen;
          return (
            <button
              key={t.screen}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => {
                setPhoneOverlay(null);
                navigate(t.screen);
              }}
              className={`flex h-12 min-w-[56px] flex-1 flex-col items-center justify-center rounded-3xl ${
                on ? "bg-accent-soft font-semibold text-accent-ink" : "font-medium text-ink-2"
              }`}
            >
              <Icon name={t.icon} size={20} />
              <span className="text-[12px] leading-[14px]">{t.label}</span>
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        aria-label="Search"
        onClick={openPalette}
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-glass text-ink shadow-glass backdrop-blur-[20px]"
      >
        <Icon name="search" size={22} />
      </button>
    </div>
  );
}
