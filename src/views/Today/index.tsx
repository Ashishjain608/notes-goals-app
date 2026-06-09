/**
 * Today — the hero screen.
 *
 * Surfaces every open, un-snoozed task within the current context filter, oldest
 * first, so aging work rises to the top (ADR-0004). The "columns" layout shows
 * Office | Personal side-by-side when no context is filtered, and collapses to a
 * single list when one context is selected. Tasks completed today are tucked in a
 * dense group at the bottom. An inline quick-add sits under the header.
 *
 * This view is a thin shell: it reads store slices, runs the frozen `selectToday`
 * / `goalsById` selectors, and renders shared components. All mutations route
 * through store actions.
 */
import type { JSX } from "react";
import type { ContextFilter, Goal, Task } from "@/types";
import { useStore, selectToday, goalsById, type TodayView } from "@/store";
import { TaskRow, SectionLabel, EmptyState, ContextDot } from "@/components";
import { QuickAddInline } from "@/views/Capture";

/** Aging visualization mode for Today's rows (v1 uses "noticeable" per the contract). */
const AGING_MODE = "noticeable" as const;

/** Resolved store actions used to wire row interactions. */
interface RowHandlers {
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onOpenGoal: (goalId: string) => void;
  onTogglePriority: (id: string) => void;
}

/** Today's date as the prototype's serif headline string, e.g. "Sunday, June 7". */
function todayHeadline(now: Date): string {
  return now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** A column header pairing the context glyph with its uppercase label. */
function ContextHeader({ context }: { context: Task["context"] }): JSX.Element {
  return (
    <div className="mb-0.5 flex items-center gap-2.5 px-4">
      <ContextDot context={context} size={8} />
      <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-ink-2">
        {context === "office" ? "Office" : "Personal"}
      </span>
    </div>
  );
}

/** The page header: eyebrow, serif date, and the open / aging / done summary line. */
function TodayHeader({ view, now }: { view: TodayView; now: Date }): JSX.Element {
  return (
    <header className="mb-6 px-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[.1em] text-accent-ink">
        Today
      </div>
      <h1 className="m-0 font-serif text-[34px] font-normal leading-[1.05] tracking-[-.01em]">
        {todayHeadline(now)}
      </h1>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-ink-2">
        <span className="flex-shrink-0 whitespace-nowrap">
          <strong className="font-semibold text-ink">{view.openCount}</strong> open
        </span>
        {view.oldestAgeDays >= 5 && (
          <span className="flex-shrink-0 whitespace-nowrap text-accent-ink">
            oldest has waited {view.oldestAgeDays}d
          </span>
        )}
        {view.completedToday.length > 0 && (
          <span className="flex-shrink-0 whitespace-nowrap">
            {view.completedToday.length} done today
          </span>
        )}
      </div>
    </header>
  );
}

/** The "Completed today" group of dense rows, or nothing when none completed. */
function CompletedGroup({
  tasks,
  gById,
  handlers,
}: {
  tasks: Task[];
  gById: Record<string, Goal>;
  handlers: RowHandlers;
}): JSX.Element | null {
  if (tasks.length === 0) return null;
  return (
    <div className="mt-[22px]">
      <div className="mb-0.5 px-4">
        <SectionLabel count={tasks.length}>Completed today</SectionLabel>
      </div>
      <div>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            mode={AGING_MODE}
            dense
            goal={task.goalId ? gById[task.goalId] ?? null : null}
            onToggle={handlers.onToggle}
            onOpen={handlers.onOpen}
            onOpenGoal={handlers.onOpenGoal}
          />
        ))}
      </div>
    </div>
  );
}

/** A list of open task rows for one column; no per-row context (the header conveys it). */
function ColumnTasks({
  tasks,
  gById,
  handlers,
}: {
  tasks: Task[];
  gById: Record<string, Goal>;
  handlers: RowHandlers;
}): JSX.Element {
  return (
    <div>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          mode={AGING_MODE}
          showContext={false}
          goal={task.goalId ? gById[task.goalId] ?? null : null}
          onToggle={handlers.onToggle}
          onOpen={handlers.onOpen}
          onOpenGoal={handlers.onOpenGoal}
          onTogglePriority={handlers.onTogglePriority}
        />
      ))}
    </div>
  );
}

/** A column's "All clear." filler when it has no open tasks. */
function ColumnEmpty(): JSX.Element {
  return <div className="px-4 py-3.5 text-[13px] italic text-ink-3">All clear.</div>;
}

/** The two-column Office | Personal grid shown when no context is filtered. */
function ColumnsBody({
  view,
  gById,
  handlers,
}: {
  view: TodayView;
  gById: Record<string, Goal>;
  handlers: RowHandlers;
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-7">
      <div>
        <ContextHeader context="office" />
        {view.office.length > 0 ? (
          <ColumnTasks tasks={view.office} gById={gById} handlers={handlers} />
        ) : (
          <ColumnEmpty />
        )}
      </div>
      <div>
        <ContextHeader context="personal" />
        {view.personal.length > 0 ? (
          <ColumnTasks tasks={view.personal} gById={gById} handlers={handlers} />
        ) : (
          <ColumnEmpty />
        )}
      </div>
      <div className="col-span-full">
        <CompletedGroup tasks={view.completedToday} gById={gById} handlers={handlers} />
      </div>
    </div>
  );
}

/** The single-column body shown when one context is filtered. */
function SingleColumnBody({
  tasks,
  view,
  gById,
  handlers,
}: {
  tasks: Task[];
  view: TodayView;
  gById: Record<string, Goal>;
  handlers: RowHandlers;
}): JSX.Element {
  return (
    <div>
      {tasks.length > 0 ? (
        <ColumnTasks tasks={tasks} gById={gById} handlers={handlers} />
      ) : (
        <EmptyState
          title="Nothing waiting on you."
          hint="Open tasks appear here automatically until you finish or drop them."
        />
      )}
      <CompletedGroup tasks={view.completedToday} gById={gById} handlers={handlers} />
    </div>
  );
}

/** The all-clear empty state shown when no context has open tasks. */
function FullEmptyBody({
  view,
  gById,
  handlers,
}: {
  view: TodayView;
  gById: Record<string, Goal>;
  handlers: RowHandlers;
}): JSX.Element {
  return (
    <div>
      <EmptyState
        title="Nothing waiting on you."
        hint="Open tasks appear here automatically until you finish or drop them."
      />
      <CompletedGroup tasks={view.completedToday} gById={gById} handlers={handlers} />
    </div>
  );
}

/** The Today screen. */
export default function Today(): JSX.Element {
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const contextFilter = useStore((s) => s.contextFilter);
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);
  const toggleTaskPriority = useStore((s) => s.toggleTaskPriority);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const navigate = useStore((s) => s.navigate);

  const view = selectToday(tasks, contextFilter);
  const gById = goalsById(goals);

  const handlers: RowHandlers = {
    onToggle: (id) => void toggleTaskStatus(id),
    onOpen: (id) => openTaskDetail(id),
    onOpenGoal: (goalId) => navigate("goal", goalId),
    onTogglePriority: (id) => void toggleTaskPriority(id),
  };

  const isAll = contextFilter === "all";
  const body = renderBody(contextFilter, view, gById, handlers);

  return (
    <div className="scroll h-full pb-[120px] pt-10">
      <div className={`mx-auto px-6 ${isAll ? "max-w-[880px]" : "max-w-[640px]"}`}>
        <TodayHeader view={view} now={new Date()} />
        <QuickAddInline />
        <div className="mt-[18px]">{body}</div>
      </div>
    </div>
  );
}

/** Pick the body layout for the active context filter. */
function renderBody(
  filter: ContextFilter,
  view: TodayView,
  gById: Record<string, Goal>,
  handlers: RowHandlers,
): JSX.Element {
  if (filter === "all") {
    if (view.openCount === 0) return <FullEmptyBody view={view} gById={gById} handlers={handlers} />;
    return <ColumnsBody view={view} gById={gById} handlers={handlers} />;
  }

  const tasks = filter === "office" ? view.office : view.personal;
  return <SingleColumnBody tasks={tasks} view={view} gById={gById} handlers={handlers} />;
}
