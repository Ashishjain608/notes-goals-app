/**
 * PhoneTasks — the Tasks tab on the phone (ADR-0012): status segments, filter
 * chips, and rows grouped by goal. Each row carries a 44px SlateToggle, the
 * one-tap commit that the desktop's tiny icon never offered.
 */
import { useMemo, useState, type JSX } from "react";
import type { Task, TaskStatus } from "@/types";
import { useStore, selectBacklog, selectBacklogByGoal, selectSlate, isOnSlate } from "@/store";
import { Icon } from "@/components";
import { ChipStrip, type Chip } from "@/components/ChipStrip";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TaskRowCompact } from "@/components/TaskRowCompact";
import { PhoneHeader } from "@/shell/phone/PhoneHeader";
import { matchesChips, metaLine, toggleCommitWithUndo, toggleDoneWithUndo, setStatusWithUndo, type TaskChip } from "./taskLogic";

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "dropped", label: "Dropped" },
] as const;

const CHIPS: ReadonlyArray<Chip<TaskChip>> = [
  { value: "due", label: "Due soon", icon: "calendar" },
  { value: "snoozed", label: "Snoozed", icon: "snooze" },
  { value: "goal", label: "Linked to goal", icon: "goals" },
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
];

/** 44px commit toggle: off accent-soft, on accent with a white icon. */
function SlateToggle({ on, onToggle }: { on: boolean; onToggle: () => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove from today's slate" : "Commit to today's slate"}
      onClick={onToggle}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
        on ? "bg-accent text-white [[data-theme=spectrum-dark]_&]:text-bg" : "bg-accent-soft text-accent-ink"
      }`}
    >
      <Icon name={on ? "check" : "calendar"} size={20} />
    </button>
  );
}

export default function PhoneTasks(): JSX.Element {
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const contextFilter = useStore((s) => s.contextFilter);
  const day = useStore((s) => s.day);
  const slateCap = useStore((s) => s.slateCap);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const [status, setStatus] = useState<TaskStatus>("open");
  const [chips, setChips] = useState<TaskChip[]>([]);

  const rows = useMemo(
    () => selectBacklog(tasks, contextFilter, { status, chip: null, query: "" }).filter((t) => matchesChips(t, chips)),
    [tasks, contextFilter, status, chips],
  );
  const groups = useMemo(() => selectBacklogByGoal(rows, goals, tasks), [rows, goals, tasks]);
  const slate = useMemo(() => selectSlate(tasks, slateCap), [tasks, slateCap, day]);
  const openCount = useMemo(
    () => tasks.filter((t) => t.status === "open" && (contextFilter === "all" || t.context === contextFilter)).length,
    [tasks, contextFilter],
  );

  const toggleChip = (c: TaskChip): void =>
    setChips((cur) => {
      if (cur.includes(c)) return cur.filter((x) => x !== c);
      // Office and Personal are alternatives.
      const rest = c === "office" ? cur.filter((x) => x !== "personal") : c === "personal" ? cur.filter((x) => x !== "office") : cur;
      return [...rest, c];
    });

  const row = (t: Task): JSX.Element => {
    const onSlate = isOnSlate(t, day);
    const m = metaLine(t, null, day);
    return (
      <TaskRowCompact
        key={t.id}
        title={t.title}
        meta={m.text || undefined}
        overdue={m.overdue}
        done={t.status === "done"}
        dropped={t.status === "dropped"}
        onToggle={() => (t.status === "dropped" ? setStatusWithUndo(t, "open", "Task reopened") : toggleDoneWithUndo(t))}
        onOpen={() => openTaskDetail(t.id)}
        trailing={t.status === "open" ? <SlateToggle on={onSlate} onToggle={() => void toggleCommitWithUndo(t, onSlate)} /> : undefined}
      />
    );
  };

  return (
    <div className="scroll h-full overflow-y-auto px-4 pt-3">
      <PhoneHeader title="Tasks" subline={`${openCount} open · ${slate.count} of ${slate.cap} committed today`} />
      <div className="mt-4">
        <SegmentedControl label="Status" options={STATUSES} value={status} onChange={setStatus} />
      </div>
      <div className="mt-3">
        <ChipStrip label="Filters" chips={CHIPS} pressed={chips} onToggle={toggleChip} />
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-[15px] italic text-ink-3">Nothing here.</p>
      ) : (
        groups.map((g) => (
          <section key={g.goal?.id ?? "none"} className="mt-5">
            <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-semibold text-ink">
              <span className="text-ink-2">
                {g.goal ? <Icon name="goals" size={18} /> : <span className="inline-block h-[18px] w-[18px] rounded-full border-[1.5px] border-dashed border-ink-3 align-middle" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{g.goal ? g.goal.title : "No goal"}</span>
              {g.progress && (
                <span className="shrink-0 text-[13px] font-normal text-ink-2">
                  {g.progress.done} of {g.progress.total} done
                </span>
              )}
            </h2>
            <div className="flex flex-col gap-1.5">{g.tasks.map(row)}</div>
          </section>
        ))
      )}
    </div>
  );
}
