/**
 * Left navigation rail (the chosen nav variant). Reads the active screen and
 * theme from the store; switches screens and toggles theme.
 */
import { Icon, type IconName } from "@/components";
import { useStore } from "@/store";
import { Brand } from "./Brand";

type NavKey = "today" | "tasks" | "notes" | "goals";

const NAV: { key: NavKey; label: string; icon: IconName }[] = [
  { key: "today", label: "Today", icon: "today" },
  { key: "tasks", label: "All Tasks", icon: "tasks" },
  { key: "notes", label: "Notes", icon: "notes" },
  { key: "goals", label: "Goals", icon: "goals" },
];

function ThemeToggle(): JSX.Element {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  return (
    <button
      title="Toggle theme"
      onClick={toggleTheme}
      className="grid h-[34px] w-[34px] place-items-center rounded-md text-ink-2 transition-colors hover:bg-raise"
    >
      <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
    </button>
  );
}

export function NavRail(): JSX.Element {
  const screen = useStore((s) => s.route.screen);
  const navigate = useStore((s) => s.navigate);
  const active: NavKey = screen === "goal" ? "goals" : (screen as NavKey);

  return (
    <nav className="flex w-[66px] shrink-0 flex-col items-center gap-1.5 border-r border-line bg-bg py-4">
      <div className="mb-3">
        <Brand />
      </div>
      {NAV.map((n) => {
        const on = active === n.key;
        return (
          <button
            key={n.key}
            title={n.label}
            onClick={() => navigate(n.key)}
            className={`grid h-[42px] w-[42px] place-items-center rounded-lg transition-colors ${
              on ? "bg-accent-soft text-accent-ink" : "text-ink-3 hover:bg-raise"
            }`}
          >
            <Icon name={n.icon} size={21} />
          </button>
        );
      })}
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </nav>
  );
}
