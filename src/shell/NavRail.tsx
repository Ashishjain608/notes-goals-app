/**
 * Left navigation rail. Two layouts driven by `expanded`:
 *  - expanded: a labelled list (icon + label + live count), active item as a
 *    raised rounded card — the default.
 *  - collapsed: a compact icon-only rail (42px tiles, label via tooltip).
 *
 * Counts are live, honoring the global context filter: open-today, open tasks,
 * notes, and active/on-hold goals. Switches screens and toggles the theme.
 */
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

function ThemeToggle({ expanded }: { expanded: boolean }): JSX.Element {
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
        <span className="text-[14px] font-medium">{theme === "light" ? "Dark mode" : "Light mode"}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      title="Toggle theme"
      onClick={toggleTheme}
      className="grid h-[34px] w-[34px] place-items-center rounded-md text-ink-2 transition-colors hover:bg-raise"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/** Toggles the floating scratchpad — sits beside the theme toggle. */
function ScratchToggle({ expanded }: { expanded: boolean }): JSX.Element {
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
        <span className="flex-1 text-[14px] font-medium">Scratchpad</span>
        <span className="text-[11px] tabular-nums text-ink-3">⌘J</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      title="Scratchpad (⌘J)"
      onClick={toggleScratch}
      className={`grid h-[34px] w-[34px] place-items-center rounded-md transition-colors hover:bg-raise ${
        open ? "text-accent" : "text-ink-2"
      }`}
    >
      <Icon name="scratch" size={18} />
    </button>
  );
}

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

  return (
    <nav
      className={`flex shrink-0 flex-col gap-1 bg-bg py-4 ${
        expanded ? "w-[228px] px-3" : "w-[66px] items-center"
      }`}
    >
      {NAV.map((n) => {
        const on = active === n.key;
        const count = countFor[n.key];

        if (!expanded) {
          return (
            <button
              key={n.key}
              type="button"
              title={n.label}
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
              className={`flex-1 text-[14px] tracking-[-.005em] ${
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
      })}

      <div className="mt-auto flex flex-col gap-1">
        <ScratchToggle expanded={expanded} />
        <ThemeToggle expanded={expanded} />
      </div>
    </nav>
  );
}
