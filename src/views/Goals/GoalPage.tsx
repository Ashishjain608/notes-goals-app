/**
 * Goal page (split layout) — the detail view for a single goal.
 *
 * Left/main column carries the editorial content: a meta row (context, a status
 * pill, target), the serif title and description, a divider, then the live list
 * of linked tasks (open first, then a dense done group). The right column is a
 * sticky sidebar with a live Progress card and the goal's owned notes.
 *
 * Resolves the goal from the store by `goalId`; renders a "Goal not found"
 * fallback (with a back button) when the id no longer matches — goal status
 * never cascades to its tasks/notes (ADR-0002), so the lists always render
 * regardless of the goal's status. Progress and links come from the pure
 * selectors; task mutations and navigation are delegated to store actions.
 */
import { useMemo, type JSX } from "react";
import type { Goal, Note, Task } from "@/types";
import {
  useStore,
  selectGoalProgress,
  selectGoalTasks,
  selectGoalNotes,
} from "@/store";
import { TaskRow, ProgressBar, ContextDot, Icon, EmptyState } from "@/components";
import { formatShortDate } from "@/lib/dates";

export interface GoalPageProps {
  /** The route's goal id (passed by the shell as `route.goalId`). */
  goalId: string;
}

/* --------------------------------------------------------------- small parts */

/** A back link to the goals overview. */
function BackButton({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink"
    >
      <Icon name="chevron" size={14} className="rotate-180" />
      Goals
    </button>
  );
}

/** Meta row: context, a status pill, and an optional target date. */
function GoalMeta({ goal }: { goal: Goal }): JSX.Element {
  const target = formatShortDate(goal.target);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5 text-[13px] text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <ContextDot context={goal.context} />
        {goal.context}
      </span>
      <span className="text-ink-3">·</span>
      <span className="inline-flex items-center rounded-full bg-accent-soft px-[9px] py-[2px] text-xs font-semibold text-accent-ink">
        {goal.status}
      </span>
      {target && (
        <>
          <span className="text-ink-3">·</span>
          <span className="inline-flex items-center gap-[5px]">
            <Icon name="calendar" size={13} />
            Target {target}
          </span>
        </>
      )}
    </div>
  );
}

interface TaskListProps {
  open: Task[];
  done: Task[];
  total: number;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onOpenGoal: (goalId: string) => void;
}

/** The linked-task list: open tasks, then a dense done group, with a header. */
function LinkedTasks({ open, done, total, onToggle, onOpen, onOpenGoal }: TaskListProps): JSX.Element {
  if (total === 0) {
    return (
      <EmptyState
        title="No tasks linked yet"
        hint="Link tasks from their detail panel and they'll gather here."
      />
    );
  }

  return (
    <div>
      <div className="mb-1 px-4 text-xs font-semibold uppercase tracking-[.07em] text-ink-3">
        Linked tasks · {total}
      </div>
      {open.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          mode="noticeable"
          onToggle={onToggle}
          onOpen={onOpen}
          onOpenGoal={onOpenGoal}
        />
      ))}
      {done.length > 0 && (
        <div className="mt-3.5">
          {done.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              mode="noticeable"
              dense
              onToggle={onToggle}
              onOpen={onOpen}
              onOpenGoal={onOpenGoal}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ProgressCardProps {
  done: number;
  total: number;
  pct: number;
}

/** Sidebar progress card: a live bar, a done/total count, and a percent line. */
function ProgressCard({ done, total, pct }: ProgressCardProps): JSX.Element {
  return (
    <div className="rounded-xl border border-line bg-surface p-[18px] shadow-sm">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-[.06em] text-ink-3">Progress</span>
        <span className="text-[13px] tabular-nums text-ink-2">
          <strong className="font-semibold text-ink">{done}</strong> of {total} done
        </span>
      </div>
      <ProgressBar value={done} total={total} height={7} />
      <div className="mt-2 text-xs text-ink-3">
        {pct}% · updates live as you complete linked tasks
      </div>
    </div>
  );
}

/** Sidebar notes list: title + excerpt cards for the goal's owned notes. */
function GoalNotes({ notes }: { notes: Note[] }): JSX.Element {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[.07em] text-ink-3">
        Notes · {notes.length}
      </div>
      {notes.length === 0 ? (
        <p className="text-[13.5px] italic text-ink-3">This goal owns no notes yet.</p>
      ) : (
        <div className="grid gap-2">
          {notes.map((note) => (
            <div key={note.id} className="rounded-[11px] border border-line bg-surface px-[15px] py-[13px]">
              <div className="mb-1 flex items-center gap-2">
                <ContextDot context={note.context} size={6} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-.01em] text-ink">
                  {note.title}
                </span>
              </div>
              <div className="text-[12px] text-ink-3">Edited {formatShortDate(note.updated)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- not-found case */

/** Fallback when the goal id no longer resolves (e.g. just deleted). */
function GoalNotFound({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <div className="scroll h-full pt-10 pb-[120px]">
      <div className="mx-auto max-w-[660px] px-10">
        <BackButton onBack={onBack} />
        <EmptyState title="Goal not found" hint="It may have been deleted." />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the view */

/** Split goal page: content column + sticky progress/notes sidebar. */
export function GoalPage({ goalId }: GoalPageProps): JSX.Element {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const navigate = useStore((s) => s.navigate);
  const toggleTaskStatus = useStore((s) => s.toggleTaskStatus);
  const openTaskDetail = useStore((s) => s.openTaskDetail);

  const goal = useMemo(() => goals.find((g) => g.id === goalId), [goals, goalId]);

  const progress = useMemo(() => selectGoalProgress(goalId, tasks), [goalId, tasks]);
  const linkedTasks = useMemo(() => selectGoalTasks(goalId, tasks), [goalId, tasks]);
  const linkedNotes = useMemo(() => selectGoalNotes(goalId, notes), [goalId, notes]);

  const goBack = (): void => navigate("goals");
  const openGoal = (id: string): void => navigate("goal", id);

  if (!goal) return <GoalNotFound onBack={goBack} />;

  return (
    <div className="scroll h-full pt-10 pb-[120px]">
      <div className="mx-auto max-w-[900px] px-10">
        <BackButton onBack={goBack} />

        <div className="grid grid-cols-[1fr_300px] items-start gap-11">
          {/* main / content column */}
          <div className="min-w-0">
            <GoalMeta goal={goal} />
            <h1 className="m-0 mb-3.5 font-serif text-[38px] font-medium leading-[1.08] tracking-[-.015em] text-ink">
              {goal.title}
            </h1>
            {goal.description && (
              <p className="m-0 mb-1.5 max-w-[600px] font-serif text-[18px] leading-[1.6] text-ink-2">
                {goal.description}
              </p>
            )}

            <div className="mt-[28px] mb-[18px] h-px bg-line" />

            <div className="-ml-4">
              <LinkedTasks
                open={linkedTasks.open}
                done={linkedTasks.done}
                total={progress.total}
                onToggle={toggleTaskStatus}
                onOpen={openTaskDetail}
                onOpenGoal={openGoal}
              />
            </div>
          </div>

          {/* sticky sidebar */}
          <aside className="sticky top-0 grid gap-[26px]">
            <ProgressCard done={progress.done} total={progress.total} pct={progress.pct} />
            <GoalNotes notes={linkedNotes} />
          </aside>
        </div>
      </div>
    </div>
  );
}

export default GoalPage;
