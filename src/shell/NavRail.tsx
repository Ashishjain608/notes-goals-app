/**
 * Left navigation rail.
 *
 * Pinned (⌘B / SidebarToggle) drives `expanded`, same as always: a single <nav>
 * whose width/padding tween between the 66px icon-only rail and the 228px
 * labelled list — in flow, so it reflows `<main>` on purpose.
 *
 * While pinned collapsed, hovering (or tabbing into) that same 66px rail reveals
 * the labelled list a second time as a floating panel, absolutely positioned over
 * the content on its own z-index. The rail itself never resizes for this — only
 * the floating panel mounts/unmounts, animated with transform+opacity (never
 * width), so `<main>` never reflows and the reveal never triggers layout. A short
 * delay on close absorbs the pointer briefly leaving (crossing a gap, overshoot);
 * moving back in cancels it. Tabbing into the rail's one focusable icon hands
 * focus straight into the floating panel's first (identical) button once it
 * mounts, so labels are reachable without a mouse and there's no doubled tab stop
 * between the two copies of the list.
 *
 * Counts are live, honoring the global context filter: open-today, open tasks,
 * notes, and active/on-hold goals. Switches screens and toggles the theme.
 */
import { useEffect, useRef, useState, type JSX } from "react";
import { Icon, type IconName } from "@/components";
import { useStore } from "@/store";
import { isSnoozed } from "@/lib/dates";
import type { Context } from "@/types";

type NavKey = "today" | "tasks" | "activity" | "notes" | "goals";

const NAV: { key: NavKey; label: string; icon: IconName }[] = [
  { key: "today", label: "Today", icon: "today" },
  { key: "tasks", label: "All Tasks", icon: "tasks" },
  { key: "activity", label: "Activity", icon: "clock" },
  { key: "notes", label: "Notes", icon: "notes" },
  { key: "goals", label: "Goals", icon: "goals" },
];

// Grace period before the floating panel closes once the pointer/focus leaves,
// so brushing past the rail or crossing the gap to it doesn't flicker.
const HOVER_CLOSE_DELAY_MS = 300;
// Must match the `.ng-nav-flyout-out` animation duration below — how long the
// panel stays mounted to play its exit animation before it's removed.
const FLYOUT_EXIT_MS = 140;

function ThemeToggle({
  expanded,
  restrictTab,
}: {
  expanded: boolean;
  restrictTab?: boolean;
}): JSX.Element {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const icon = theme === "light" ? "moon" : "sun";
  if (expanded) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-[9px] text-left text-ink-2 transition-colors hover:bg-raise"
      >
        <Icon name={icon} size={18} />
        <span className="whitespace-nowrap text-[14px] font-medium">
          {theme === "light" ? "Dark mode" : "Light mode"}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      title="Toggle theme"
      tabIndex={restrictTab ? -1 : undefined}
      onClick={toggleTheme}
      className="grid h-[34px] w-[34px] place-items-center rounded-md text-ink-2 transition-colors hover:bg-raise"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/** Toggles the floating scratchpad — sits beside the theme toggle. */
function ScratchToggle({
  expanded,
  restrictTab,
}: {
  expanded: boolean;
  restrictTab?: boolean;
}): JSX.Element {
  const open = useStore((s) => s.scratchOpen);
  const toggleScratch = useStore((s) => s.toggleScratch);
  if (expanded) {
    return (
      <button
        type="button"
        onClick={toggleScratch}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-[9px] text-left transition-colors hover:bg-raise ${
          open ? "text-accent" : "text-ink-2"
        }`}
      >
        <Icon name="scratch" size={18} />
        <span className="flex-1 whitespace-nowrap text-[14px] font-medium">Scratchpad</span>
        <span className="text-[11px] tabular-nums text-ink-3">⌘J</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      title="Scratchpad (⌘J)"
      tabIndex={restrictTab ? -1 : undefined}
      onClick={toggleScratch}
      className={`grid h-[34px] w-[34px] place-items-center rounded-md transition-colors ${
        open ? "text-accent" : "text-ink-2"
      }`}
    >
      <Icon name="scratch" size={18} />
    </button>
  );
}

/** Opens the Settings modal — sits beside the scratchpad/theme toggles. */
function SettingsToggle({
  expanded,
  restrictTab,
}: {
  expanded: boolean;
  restrictTab?: boolean;
}): JSX.Element {
  const openSettings = useStore((s) => s.openSettings);
  if (expanded) {
    return (
      <button
        type="button"
        onClick={openSettings}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-[9px] text-left text-ink-2 transition-colors hover:bg-raise"
      >
        <Icon name="settings" size={18} />
        <span className="whitespace-nowrap text-[14px] font-medium">Settings</span>
        <span className="ml-auto text-[11px] tabular-nums text-ink-3">⌘,</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      title="Settings (⌘,)"
      tabIndex={restrictTab ? -1 : undefined}
      onClick={openSettings}
      className="grid h-[34px] w-[34px] place-items-center rounded-md text-ink-2 transition-colors hover:bg-raise"
    >
      <Icon name="settings" size={18} />
    </button>
  );
}

/** The nav rail: pinned expand/collapse in flow, plus a hover/focus flyout while collapsed. */
export function NavRail({ expanded }: { expanded: boolean }): JSX.Element {
  const screen = useStore((s) => s.route.screen);
  const navigate = useStore((s) => s.navigate);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const goals = useStore((s) => s.goals);
  const filter = useStore((s) => s.contextFilter);

  const active: NavKey = screen === "goal" ? "goals" : (screen as NavKey);

  const inCtx = (c: Context): boolean => filter === "all" || c === filter;
  const countFor: Partial<Record<NavKey, number>> = {
    today: tasks.filter((t) => inCtx(t.context) && t.status === "open" && !isSnoozed(t.snoozeUntil))
      .length,
    tasks: tasks.filter((t) => inCtx(t.context) && t.status === "open").length,
    notes: notes.filter((n) => inCtx(n.context)).length,
    goals: goals.filter((g) => inCtx(g.context) && (g.status === "active" || g.status === "onhold"))
      .length,
  };

  // Floating-panel presence, decoupled from the pointer/focus signal (`open`) so
  // the exit animation gets to finish before the panel leaves the DOM — same
  // mounted/closing shape as Scratchpad and TaskDetail use for their overlays.
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstIconRef = useRef<HTMLButtonElement | null>(null);
  const flyoutRef = useRef<HTMLElement | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const requestOpen = () => {
    clearCloseTimer();
    setOpen(true);
  };
  const requestClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };
  useEffect(() => clearCloseTimer, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    setClosing(true);
    const timer = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, FLYOUT_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Keyboard hand-off: the rail exposes exactly one tabbable icon (the rest are
  // reachable via the panel once it's open, avoiding a doubled tab sequence).
  // Landing on it opens the panel; once mounted, move focus into its first row.
  useEffect(() => {
    if (!mounted) return;
    if (document.activeElement === firstIconRef.current) {
      flyoutRef.current?.querySelector<HTMLElement>("button")?.focus();
    }
  }, [mounted]);

  const renderRows = (opts: { icon: boolean; restrictTab: boolean; assignFirstRef?: boolean }) =>
    NAV.map((n, i) => {
      const on = active === n.key;
      const count = countFor[n.key];

      if (opts.icon) {
        return (
          <button
            key={n.key}
            ref={opts.assignFirstRef && i === 0 ? firstIconRef : undefined}
            type="button"
            title={n.label}
            tabIndex={opts.restrictTab && i > 0 ? -1 : undefined}
            onClick={() => navigate(n.key)}
            className={`grid h-[42px] w-[42px] place-items-center rounded-lg transition-colors ${
              on ? "bg-accent-soft text-accent-ink" : "text-ink-3 hover:bg-raise"
            }`}
          >
            <Icon name={n.icon} size={21} />
          </button>
        );
      }

      return (
        <button
          key={n.key}
          type="button"
          onClick={() => navigate(n.key)}
          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-[9px] text-left transition-colors ${
            on ? "border-line bg-surface shadow-sm" : "border-transparent hover:bg-raise"
          }`}
        >
          <span className={on ? "text-accent" : "text-ink-3"}>
            <Icon name={n.icon} size={19} />
          </span>
          <span
            className={`flex-1 whitespace-nowrap text-[14px] tracking-[-.005em] ${
              on ? "font-semibold text-ink" : "font-medium text-ink-2"
            }`}
          >
            {n.label}
          </span>
          {count != null && (
            <span className="text-[13px] tabular-nums text-ink-3">{count}</span>
          )}
        </button>
      );
    });

  const showFlyout = !expanded && mounted;

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={requestOpen}
      onMouseLeave={requestClose}
      onFocus={requestOpen}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        requestClose();
      }}
    >
      <nav
        className={`flex h-full shrink-0 flex-col gap-1 overflow-hidden bg-bg py-4 transition-[width,padding] duration-[260ms] ease-[cubic-bezier(.4,0,.2,1)] ${
          expanded ? "w-[228px] px-3" : "w-[66px] items-center"
        }`}
      >
        {renderRows({ icon: !expanded, restrictTab: !expanded, assignFirstRef: !expanded })}
        <div className="mt-auto flex flex-col gap-1">
          <ScratchToggle expanded={expanded} restrictTab={!expanded} />
          <ThemeToggle expanded={expanded} restrictTab={!expanded} />
          <SettingsToggle expanded={expanded} restrictTab={!expanded} />
        </div>
      </nav>

      {showFlyout && (
        <nav
          ref={flyoutRef}
          className={`absolute inset-y-0 left-0 z-30 flex w-[228px] flex-col gap-1 overflow-hidden border-r border-line bg-surface px-3 py-4 shadow ${
            closing ? "ng-nav-flyout-out" : "ng-nav-flyout-in"
          }`}
        >
          {renderRows({ icon: false, restrictTab: false })}
          <div className="mt-auto flex flex-col gap-1">
            <ScratchToggle expanded />
            <ThemeToggle expanded />
            <SettingsToggle expanded />
          </div>
        </nav>
      )}
    </div>
  );
}
