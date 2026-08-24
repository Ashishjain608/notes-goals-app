/**
 * Activity — a read-only retrospective lens over a single day.
 *
 * Like Today, this is a live query (not a stored page): it shows the tasks
 * created and the tasks completed on the selected local day (ADR-0004), pulled
 * straight from the `created` / `completed` timestamps. A date stepper walks
 * back through past days (capped at today). Honors the global context filter and
 * reuses the shared `TaskRow`; toggling/opening rows routes through the store
 * exactly as elsewhere.
 */
import { useMemo, useState, type JSX } from "react";
import type { Goal, IsoDate, Task } from "@/types";
import { useStore, selectDayActivity, goalsById } from "@/store";
import { TaskRow, SectionLabel, EmptyState, Icon, DateField } from "@/components";
import { localToday, toLocalDateKey } from "@/lib/dates";

const AGING_MODE = "noticeable" as const;

interface RowHandlers {
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onOpenGoal: (goalId: string) => void;
}

/* ------------------------------------------------------------- date helpers */

/** Parse a 'YYYY-MM-DD' key to that local calendar day's midnight. */
function dayKeyToDate(key: IsoDate): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** The key `delta` days from `key` (negative goes back). */
function shiftDay(key: IsoDate, delta: number): IsoDate {
  const date = dayKeyToDate(key);
  date.setDate(date.getDate() + delta);
  return toLocalDateKey(date);
}

/** Long headline for a day, e.g. "Tuesday, June 9". */
function dayHeadline(key: IsoDate): string {
  return dayKeyToDate(key).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/* ----------------------------------------------------------------- stepper */

interface DateStepperProps {
  day: IsoDate;
  today: IsoDate;
  onChange: (day: IsoDate) => void;
}

/** Prev/next day arrows, a date field (capped at today), and a Today reset. */
function DateStepper({ day, today, onChange }: DateStepperProps): JSX.Element {
  const atToday = day >= today;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => onChange(shiftDay(day, -1))}
        className="grid h-8 w-8 place-items-center rounded-md text-ink-2 transition-colors hover:bg-raise"
      >
        <Icon name="chevron" size={16} className="rotate-180" />
      </button>
      <DateField value={day} max={today} onPick={onChange} placeholder="Pick a day" />
      <button
        type="button"
        aria-label="Next day"
        disabled={atToday}
        onClick={() => onChange(shiftDay(day, 1))}
        className="grid h-8 w-8 place-items-center rounded-md text-ink-2 transition-colors hover:bg-raise disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Icon name="chevron" size={16} />
      </button>
      {!atToday && (
        <button
          type="button"
          onClick={() => onChange(today)}
          className="ml-1 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-accent-ink transition-colors hover:bg-raise"
        >
          Today
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- section */

interface ActivitySectionProps {
  label: string;
  tasks: Task[];
  gById: Record<string, Goal>;
  showContext: boolean;
  handlers: RowHandlers;
}

/** One labelled group of task rows, or nothing when the group is empty. */
function ActivitySection({ label, tasks, gById, showContext, handlers }: ActivitySectionProps): JSX.Element | null {
  if (tasks.length === 0) return null;
  return (
    <section>
      <div className="mb-0.5 px-4">
        <SectionLabel count={tasks.length}>{label}</SectionLabel>
      </div>
      <div>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            mode={AGING_MODE}
            showContext={showContext}
            goal={task.goalId ? gById[task.goalId] ?? null : null}
            onToggle={handlers.onToggle}
            onOpen={handlers.onOpen}
            onOpenGoal={handlers.onOpenGoal}
          />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ the view */

/** The Activity screen. */
export default function Activity(): JSX.Element {
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const contextFilter = useStore((s) => s.contextFilter);
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const navigate = useStore((s) => s.navigate);

  const today = localToday();
  const [day, setDay] = useState<IsoDate>(today);

  const { created, completed } = useMemo(
    () => selectDayActivity(tasks, contextFilter, day),
    [tasks, contextFilter, day],
  );
  const gById = useMemo(() => goalsById(goals), [goals]);

  const showContext = contextFilter === "all";
  const isToday = day >= today;
  const nothing = created.length === 0 && completed.length === 0;

  const handlers: RowHandlers = {
    onToggle: (id) => void toggleTaskStatus(id),
    onOpen: (id) => openTaskDetail(id),
    onOpenGoal: (goalId) => navigate("goal", goalId),
  };

  return (
    <div className="scroll h-full pb-[120px] pt-10">
      <div className="mx-auto max-w-[760px] px-10">
        <header className="mb-[26px]">
          <div className="mb-2 flex items-center justify-between gap-4">
            <div className="text-xs font-semibold uppercase tracking-[.1em] text-accent-ink">
              Activity
            </div>
            <DateStepper day={day} today={today} onChange={setDay} />
          </div>
          <h1 className="m-0 font-serif text-[32px] font-normal tracking-[-.01em] text-ink">
            {dayHeadline(day)}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-ink-2">
            <span className="whitespace-nowrap">
              <strong className="font-semibold text-ink">{completed.length}</strong> completed
            </span>
            <span className="whitespace-nowrap">
              <strong className="font-semibold text-ink">{created.length}</strong> created
            </span>
          </div>
        </header>

        {nothing ? (
          <EmptyState
            title="Nothing logged this day"
            hint={
              isToday
                ? "Tasks you create or complete today will gather here."
                : "No tasks were created or completed on this day."
            }
          />
        ) : (
          <div className="flex flex-col gap-7">
            <ActivitySection
              label="Completed"
              tasks={completed}
              gById={gById}
              showContext={showContext}
              handlers={handlers}
            />
            <ActivitySection
              label="Created"
              tasks={created}
              gById={gById}
              showContext={showContext}
              handlers={handlers}
            />
          </div>
        )}
      </div>
    </div>
  );
}
