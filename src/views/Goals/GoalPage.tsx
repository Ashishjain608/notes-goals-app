/**
 * Goal page (split layout) — the detail view for a single goal.
 *
 * Left/main column carries the editorial content: the editable header
 * (`GoalHeader` — context, status, target, the serif title and description,
 * all editable in place), a divider, then the live list of linked tasks (open
 * first, then a dense done group). The right column is a sticky sidebar with
 * a live Progress card and the goal's owned notes.
 *
 * Resolves the goal from the store by `goalId`; renders a "Goal not found"
 * fallback (with a back button) when the id no longer matches — goal status
 * never cascades to its tasks/notes (ADR-0002), so the lists always render
 * regardless of the goal's status, and editing status here is a single-field
 * write to the goal, never a bulk operation. Progress and links come from the
 * pure selectors; task mutations and navigation are delegated to store actions.
 */
import { useMemo, useState, type JSX } from "react";
import type { Goal, Note, Task } from "@/types";
import {
  useStore,
  selectGoalProgress,
  selectGoalTasks,
  selectGoalNotes,
} from "@/store";
import { TaskRow, ProgressBar, ContextDot, Icon, EmptyState } from "@/components";
import { formatShortDate } from "@/lib/dates";
import { NoteEditorDrawer } from "./NoteEditorDrawer";
import { GoalHeader } from "./GoalHeader";

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

interface TaskListProps {
  open: Task[];
  done: Task[];
  total: number;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onOpenGoal: (goalId: string) => void;
  onTogglePriority: (id: string) => void;
}

/** Inline quick-add that creates a task already linked to this goal. */
function GoalQuickAdd({ onAdd }: { onAdd: (title: string) => void }): JSX.Element {
  const [title, setTitle] = useState("");
  const submit = (): void => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
  };
  return (
    <div className="mx-4 mb-2.5 flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 shadow-sm">
      <span className="text-ink-3">
        <Icon name="plus" size={17} />
      </span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Add a task to this goal"
        className="flex-1 border-none bg-transparent text-[14px] tracking-[-.005em] text-ink outline-none placeholder:text-ink-3"
      />
      <kbd className="font-mono text-[11px] text-ink-3">↵</kbd>
    </div>
  );
}

/** The linked-task list: open tasks, then a dense done group (or an empty hint). */
function LinkedTasks({
  open,
  done,
  total,
  onToggle,
  onOpen,
  onOpenGoal,
  onTogglePriority,
}: TaskListProps): JSX.Element {
  if (total === 0) {
    return (
      <EmptyState
        title="No tasks linked yet"
        hint="Add one above, or link existing tasks from their detail panel."
      />
    );
  }

  return (
    <div>
      {open.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          mode="noticeable"
          onToggle={onToggle}
          onOpen={onOpen}
          onOpenGoal={onOpenGoal}
          onTogglePriority={onTogglePriority}
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

/** Sidebar notes list: an Add button + clickable cards for the goal's notes. */
function GoalNotes({
  notes,
  onAdd,
  onOpen,
}: {
  notes: Note[];
  onAdd: () => void;
  onOpen: (id: string) => void;
}): JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[.07em] text-ink-3">
          Notes · {notes.length}
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:bg-raise hover:text-ink"
        >
          <Icon name="plus" size={14} /> Add
        </button>
      </div>
      {notes.length === 0 ? (
        <p className="text-[13.5px] italic text-ink-3">
          No notes yet — add one to capture thinking for this goal.
        </p>
      ) : (
        <div className="grid gap-2">
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => onOpen(note.id)}
              className="rounded-[11px] border border-line bg-surface px-[15px] py-[13px] text-left transition-colors hover:border-line-2 hover:bg-raise"
            >
              <div className="mb-1 flex items-center gap-2">
                <ContextDot context={note.context} size={6} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-.01em] text-ink">
                  {note.title || "Untitled"}
                </span>
              </div>
              <div className="text-[12px] text-ink-3">Edited {formatShortDate(note.updated)}</div>
            </button>
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
  const toggleTaskPriority = useStore((s) => s.toggleTaskPriority);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const addTask = useStore((s) => s.addTask);
  const addNote = useStore((s) => s.addNote);
  const saveGoal = useStore((s) => s.saveGoal);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [createdNew, setCreatedNew] = useState(false);

  const goal = useMemo(() => goals.find((g) => g.id === goalId), [goals, goalId]);

  const progress = useMemo(() => selectGoalProgress(goalId, tasks), [goalId, tasks]);
  const linkedTasks = useMemo(() => selectGoalTasks(goalId, tasks), [goalId, tasks]);
  const linkedNotes = useMemo(() => (goal ? selectGoalNotes(goal, notes) : []), [goal, notes]);

  const goBack = (): void => navigate("goals");
  const openGoal = (id: string): void => navigate("goal", id);

  if (!goal) return <GoalNotFound onBack={goBack} />;

  /** Patch-and-persist: spreads onto the current goal so id/created/updated are never fabricated (ADR-0006). */
  const savePatch = (patch: Partial<Goal>): void => {
    void saveGoal({ ...goal, ...patch });
  };

  const addLinkedTask = (title: string): void => {
    void addTask({ title, context: goal.context, goalId: goal.id });
  };

  /** Create an empty note linked to this goal and open it in the drawer. */
  const addLinkedNote = async (): Promise<void> => {
    const created = await addNote({ title: "", context: goal.context, goalId: goal.id });
    setCreatedNew(true);
    setEditingNoteId(created.id);
  };

  const openNote = (id: string): void => {
    setCreatedNew(false);
    setEditingNoteId(id);
  };

  return (
    <>
      <div className="scroll h-full pt-10 pb-[120px]">
      <div className="mx-auto max-w-[900px] px-10">
        <BackButton onBack={goBack} />

        <div className="grid grid-cols-[1fr_300px] items-start gap-11">
          {/* main / content column */}
          <div className="min-w-0">
            <GoalHeader goal={goal} onSave={savePatch} />

            <div className="mt-[28px] mb-[18px] h-px bg-line" />

            <div className="-ml-4">
              <div className="mb-2 px-4 text-xs font-semibold uppercase tracking-[.07em] text-ink-3">
                Linked tasks · {progress.total}
              </div>
              <GoalQuickAdd onAdd={addLinkedTask} />
              <LinkedTasks
                open={linkedTasks.open}
                done={linkedTasks.done}
                total={progress.total}
                onToggle={toggleTaskStatus}
                onOpen={openTaskDetail}
                onOpenGoal={openGoal}
                onTogglePriority={toggleTaskPriority}
              />
            </div>
          </div>

          {/* sticky sidebar */}
          <aside className="sticky top-0 grid gap-[26px]">
            <ProgressCard done={progress.done} total={progress.total} pct={progress.pct} />
            <GoalNotes
              notes={linkedNotes}
              onAdd={() => void addLinkedNote()}
              onOpen={openNote}
            />
          </aside>
        </div>
      </div>
      </div>
      <NoteEditorDrawer
        noteId={editingNoteId}
        createdNew={createdNew}
        goalTitle={goal.title}
        onClose={() => setEditingNoteId(null)}
      />
    </>
  );
}

export default GoalPage;
