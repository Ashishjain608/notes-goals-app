/**
 * Backlog / All Tasks view — every task across the current context filter,
 * narrowed by a status tab (Open / Done / Dropped / All), optional filter chips
 * (has-due-date / snoozed / linked-to-goal), and a title text query.
 *
 * Reads `tasks`, `goals`, and `contextFilter` from the store; derives the list
 * via `selectBacklog` and resolves each task's goal via `goalsById`. Filter UI
 * lives in local component state; the actual filtering/sorting is the selector's
 * job. Mutations and navigation are delegated to store actions.
 */
import { useMemo, useState, type JSX } from "react";
import type { TaskStatus } from "@/types";
import { useStore, selectBacklog, goalsById } from "@/store";
import { TaskRow, Icon, type IconName } from "@/components";

/* ----------------------------------------------------------------- filter UI */

/** UI labels for the status tabs; "All" maps to the selector's "all". */
type StatusTab = "Open" | "Done" | "Dropped" | "all";
type FilterChip = "due" | "snoozed" | "goal";

const STATUS_TABS: StatusTab[] = ["Open", "Done", "Dropped", "all"];

/** Label shown on each status tab. */
const STATUS_LABEL: Record<StatusTab, string> = {
  Open: "Open",
  Done: "Done",
  Dropped: "Dropped",
  all: "All",
};

/** Map a UI status tab to the lowercase status the selector expects. */
function toSelectorStatus(tab: StatusTab): TaskStatus | "all" {
  return tab === "all" ? "all" : (tab.toLowerCase() as TaskStatus);
}

interface ChipDef {
  key: FilterChip;
  icon: IconName;
  label: string;
}

const CHIPS: ChipDef[] = [
  { key: "due", icon: "calendar", label: "Has due date" },
  { key: "snoozed", icon: "snooze", label: "Snoozed" },
  { key: "goal", icon: "goals", label: "Linked to goal" },
];

/* ----------------------------------------------------------------- the view */

/** All-tasks backlog with status tabs, filter chips, and a title search. */
export default function Backlog(): JSX.Element {
  const [status, setStatus] = useState<StatusTab>("Open");
  const [chip, setChip] = useState<FilterChip | null>(null);
  const [query, setQuery] = useState("");

  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const contextFilter = useStore((s) => s.contextFilter);
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const navigate = useStore((s) => s.navigate);

  const list = useMemo(
    () => selectBacklog(tasks, contextFilter, { status: toSelectorStatus(status), chip, query }),
    [tasks, contextFilter, status, chip, query],
  );
  const gById = useMemo(() => goalsById(goals), [goals]);

  // Per-status counts over the context-filtered tasks (independent of tab/chips).
  const counts = useMemo(() => {
    const inCtx = tasks.filter((t) => contextFilter === "all" || t.context === contextFilter);
    return {
      open: inCtx.filter((t) => t.status === "open").length,
      done: inCtx.filter((t) => t.status === "done").length,
      dropped: inCtx.filter((t) => t.status === "dropped").length,
    };
  }, [tasks, contextFilter]);

  /** The count badge for a status tab; "All" shows no count, mirroring the prototype. */
  const countFor = (tab: StatusTab): number | null => {
    if (tab === "Open") return counts.open;
    if (tab === "Done") return counts.done;
    if (tab === "Dropped") return counts.dropped;
    return null;
  };

  return (
    <div className="scroll h-full pt-10 pb-[120px]">
      <div className="mx-auto max-w-[720px] px-10">
        <header className="mb-[22px]">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[.1em] text-accent-ink">
            Backlog
          </div>
          <h1 className="m-0 font-serif text-[32px] font-normal tracking-[-.01em] text-ink">
            All Tasks
          </h1>
        </header>

        <div className="sticky top-[-40px] z-[2] mb-[6px] flex flex-wrap items-center gap-2 bg-bg pb-[10px]">
          <div className="flex gap-1 rounded-[10px] bg-surface-2 p-[3px]">
            {STATUS_TABS.map((tab) => {
              const active = status === tab;
              const count = countFor(tab);
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatus(tab)}
                  className={`flex items-center gap-[6px] rounded-[7px] px-[13px] py-[5px] text-[13px] font-medium transition-colors ${
                    active ? "bg-surface text-ink shadow-sm" : "text-ink-3"
                  }`}
                >
                  {STATUS_LABEL[tab]}
                  {count != null && (
                    <span className="text-[11.5px] tabular-nums text-ink-3">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mx-[2px] h-5 w-px bg-line-2" />

          {CHIPS.map(({ key, icon, label }) => {
            const active = chip === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setChip(active ? null : key)}
                className={`flex flex-shrink-0 items-center gap-[6px] whitespace-nowrap rounded-full border px-[11px] py-[5px] text-[12.5px] font-medium transition-colors ${
                  active
                    ? "border-accent-line bg-accent-soft text-accent-ink"
                    : "border-line bg-transparent text-ink-2"
                }`}
              >
                <Icon name={icon} size={13} />
                {label}
              </button>
            );
          })}

          <div className="relative flex flex-shrink-0 items-center">
            <span className="pointer-events-none absolute left-[10px] flex items-center text-ink-3">
              <Icon name="search" size={13} />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter tasks"
              aria-label="Filter tasks by title"
              className="w-[150px] rounded-full border border-line bg-transparent py-[5px] pl-[28px] pr-[11px] text-[12.5px] font-medium text-ink placeholder:text-ink-3 focus:border-accent-line focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-[6px]">
          {list.length === 0 ? (
            <div className="px-4 py-[50px] text-center italic text-ink-3">Nothing here.</div>
          ) : (
            list.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                mode="noticeable"
                showContext={contextFilter === "all"}
                goal={t.goalId ? gById[t.goalId] : null}
                onToggle={toggleTaskStatus}
                onOpen={openTaskDetail}
                onOpenGoal={(goalId) => navigate("goal", goalId)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
