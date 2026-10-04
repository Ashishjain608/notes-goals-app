/**
 * TaskSheet — a task's detail on the phone (ADR-0012), replacing TaskDetail's
 * full-screen panel. Opens while `detailTaskId` is set. Four ActionTiles
 * (Commit, Snooze, Due, Goal) sit above subtasks, notes and context; Drop and
 * Delete are at the bottom. Reversible actions offer Undo (phone toast).
 */
import { useMemo, useRef, useState, type JSX } from "react";
import type { Attachment, IsoDate, Subtask, Task } from "@/types";
import { useStore, selectSlate, isOnSlate } from "@/store";
import { AttachmentList, Checkbox, Icon } from "@/components";
import { ActionTile } from "@/components/ActionTile";
import { BottomSheet } from "@/components/BottomSheet";
import { PickerSheet, type PickerOption } from "@/components/PickerSheet";
import { SegmentedControl } from "@/components/SegmentedControl";
import { dueLabel, formatShortDate, isSnoozed } from "@/lib/dates";
import { errorMessageOf } from "@/lib/errors";
import { confirmDestructive } from "@/lib/confirm";
import { useKeyboardInset } from "@/lib/keyboard";
import { dateKeyDaysAhead } from "@/views/Capture/dueDates";
import { GrowTextarea } from "@/views/Capture/GrowTextarea";
import { Subtasks } from "@/views/Capture/Subtasks";
import { setStatusWithUndo, snoozeWithUndo, toggleCommitWithUndo, toggleDoneWithUndo } from "@/views/Backlog/taskLogic";

type Picker = "snooze" | "due" | "goal";

const CONTEXTS = [
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
] as const;

const LABEL = "mb-2 px-1 text-[13px] font-semibold uppercase tracking-[.06em] text-ink-2";

/** The "Pick a date" row shared by the Snooze and Due pickers. */
function DateRow({ value, min, onPick }: { value: IsoDate | null; min?: IsoDate; onPick: (d: IsoDate) => void }): JSX.Element {
  return (
    <label className="flex min-h-[52px] items-center gap-3 px-3 text-[16px] text-ink">
      Pick a date
      <input
        type="date"
        min={min}
        value={value ?? ""}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="ml-auto h-11 rounded-xl bg-surface-2 px-3 text-[16px] text-ink"
      />
    </label>
  );
}

export function TaskSheet(): JSX.Element {
  const detailTaskId = useStore((s) => s.detailTaskId);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const day = useStore((s) => s.day);
  const slateCap = useStore((s) => s.slateCap);
  const closeTaskDetail = useStore((s) => s.closeTaskDetail);
  const patchTask = useStore((s) => s.patchTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const removeTaskAttachment = useStore((s) => s.removeTaskAttachment);
  const openAttachmentAction = useStore((s) => s.openAttachment);
  const inset = useKeyboardInset();
  const [picker, setPicker] = useState<Picker | null>(null);

  const live = detailTaskId ? tasks.find((t) => t.id === detailTaskId) : undefined;
  // BottomSheet stays mounted through its slide-out: keep rendering the last task until it ends.
  const lastRef = useRef<Task | undefined>(live);
  if (live) lastRef.current = live;
  const task = live ?? lastRef.current;

  const slate = useMemo(() => selectSlate(tasks, slateCap), [tasks, slateCap, day]);
  const slot = useMemo(() => {
    if (!task || task.status === "dropped" || !isOnSlate(task, day)) return null;
    const onSlate = tasks.filter((t) => t.status !== "dropped" && isOnSlate(t, day));
    onSlate.sort((a, b) => a.created.localeCompare(b.created));
    return onSlate.findIndex((t) => t.id === task.id) + 1;
  }, [tasks, task, day]);

  if (!task) return <BottomSheet open={false} onClose={closeTaskDetail} title="Task">{null}</BottomSheet>;

  const onSlate = slot !== null;
  const ctxLabel = task.context === "personal" ? "Personal" : "Office";
  const heading = onSlate ? `${ctxLabel} · Slot ${slot} of ${slate.cap}` : ctxLabel;
  const done = task.status === "done";
  const dropped = task.status === "dropped";
  const dl = dueLabel(task.due);
  const goal = task.goalId ? goals.find((g) => g.id === task.goalId) : undefined;
  const snoozed = isSnoozed(task.snoozeUntil);

  const closePicker = (): void => setPicker(null);
  const setDue = (due: IsoDate | null): void => {
    void patchTask(task.id, { due });
    closePicker();
  };
  const setSnooze = (until: IsoDate | null): void => {
    snoozeWithUndo(task, until);
    closePicker();
  };
  const setGoal = (goalId: string | null): void => {
    void patchTask(task.id, { goalId });
    closePicker();
  };

  const toggleSubtask = (id: string): void => {
    void patchTask(task.id, (t) => ({
      subtasks: t.subtasks.map((s) => (s.id === id ? { ...s, status: s.status === "done" ? ("open" as const) : ("done" as const) } : s)),
    }));
  };
  const addSubtask = (title: string): void => {
    const subtask: Subtask = { id: crypto.randomUUID(), title, status: "open" };
    void patchTask(task.id, (t) => ({ subtasks: [...t.subtasks, subtask] }));
  };

  const openAttachment = (a: Attachment): void => {
    void openAttachmentAction(a.path).catch((err: unknown) => {
      window.alert(`Couldn't open “${a.name}”: ${errorMessageOf(err)}`);
    });
  };
  const removeAttachment = (a: Attachment): void => {
    void (async () => {
      try {
        await removeTaskAttachment(task.id, a.path);
      } catch (err) {
        window.alert(`Couldn't remove “${a.name}”: ${errorMessageOf(err)}`);
      }
    })();
  };

  const confirmDelete = async (): Promise<void> => {
    if (!(await confirmDestructive(`Delete “${task.title}”? This can't be undone.`))) return;
    void deleteTask(task.id);
    closeTaskDetail();
  };

  const goalOptions: PickerOption[] = goals
    .filter((g) => g.status === "active" || g.status === "onhold" || g.id === task.goalId)
    .map((g) => ({ value: g.id, label: g.title, context: g.context }));
  const dueOptions: PickerOption[] = [0, 1, 7].map((n, i) => ({
    value: dateKeyDaysAhead(n),
    label: ["Today", "Tomorrow", "In a week"][i] as string,
    hint: formatShortDate(dateKeyDaysAhead(n)) ?? undefined,
  }));
  const snoozeOptions: PickerOption[] = [1, 7].map((n, i) => ({
    value: dateKeyDaysAhead(n),
    label: ["Tomorrow", "Next week"][i] as string,
    hint: formatShortDate(dateKeyDaysAhead(n)) ?? undefined,
  }));

  return (
    <>
      <BottomSheet open={live !== undefined} onClose={closeTaskDetail} title={heading} bottomInset={inset}>
        <div className="flex flex-col gap-5 pb-4">
          <div className="flex items-start gap-1">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center">
              <Checkbox checked={done} dropped={dropped} size={24} onClick={() => (dropped ? setStatusWithUndo(task, "open", "Task reopened") : toggleDoneWithUndo(task))} />
            </div>
            {/* A cleared title isn't saved: put the saved one back so the box never disagrees with it. */}
            <div
              className="min-w-0 flex-1"
              onBlur={(e) => {
                const el: EventTarget = e.target;
                if (el instanceof HTMLTextAreaElement && !el.value.trim()) el.value = task.title;
              }}
            >
            <GrowTextarea
              taskId={task.id}
              defaultValue={task.title}
              onBlur={(v) => v.trim() && v.trim() !== task.title && void patchTask(task.id, { title: v.trim() })}
              className={`mt-[7px] w-full resize-none border-none bg-transparent text-[21px] font-semibold leading-[1.3] outline-none ${
                done || dropped ? "text-ink-2" : "text-ink"
              } ${done ? "line-through" : ""}`}
            />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {task.status === "open" && (
              <ActionTile
                icon="today"
                label={onSlate ? "Committed" : "Commit"}
                pressed={onSlate}
                badge={slot ?? undefined}
                onClick={() => void toggleCommitWithUndo(task, onSlate)}
              />
            )}
            <ActionTile icon="snooze" label={snoozed ? (formatShortDate(task.snoozeUntil) ?? "Snooze") : "Snooze"} active={snoozed} onClick={() => setPicker("snooze")} />
            <ActionTile icon="calendar" label={dl ? (formatShortDate(task.due) ?? "Due") : "Due"} active={!!dl} onClick={() => setPicker("due")} />
            <ActionTile icon="goals" label={goal ? goal.title : "Goal"} active={!!goal} onClick={() => setPicker("goal")} />
          </div>

          <section>
            <div className={LABEL}>
              Subtasks
              {task.subtasks.length > 0 && ` · ${task.subtasks.filter((s) => s.status === "done").length} of ${task.subtasks.length}`}
            </div>
            <Subtasks subtasks={task.subtasks} onToggle={toggleSubtask} onAdd={addSubtask} label={false} />
          </section>

          {task.attachments.length > 0 && (
            <section>
              <div className={LABEL}>Attachments · {task.attachments.length}</div>
              <AttachmentList attachments={task.attachments} onOpen={openAttachment} onRemove={removeAttachment} />
            </section>
          )}

          <section>
            <div className={LABEL}>Notes</div>
            <GrowTextarea
              taskId={task.id}
              defaultValue={task.details}
              onBlur={(v) => v !== task.details && void patchTask(task.id, { details: v })}
              placeholder="Add notes"
              className="min-h-12 w-full resize-none rounded-xl bg-surface-2 px-3.5 py-3 font-serif text-[17px] leading-[1.5] text-ink outline-none placeholder:text-ink-3"
            />
          </section>

          <section>
            <div className={LABEL}>Context</div>
            <SegmentedControl
              label="Context"
              options={CONTEXTS}
              value={task.context}
              onChange={(context) => context !== task.context && void patchTask(task.id, { context })}
            />
          </section>

          <div className="flex flex-col">
            {!dropped && (
              <button
                type="button"
                onClick={() => {
                  setStatusWithUndo(task, "dropped", "Task dropped");
                  closeTaskDetail();
                }}
                className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[16px] text-ink-2 active:bg-raise"
              >
                <Icon name="dropped" size={20} />
                Drop task
              </button>
            )}
            <button
              type="button"
              onClick={() => void confirmDelete()}
              className="flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-[16px] text-ink-2 active:bg-raise"
            >
              <Icon name="trash" size={20} />
              Delete task
            </button>
          </div>
        </div>
      </BottomSheet>

      <PickerSheet
        open={picker === "snooze"}
        onClose={closePicker}
        title="Snooze until"
        options={snoozeOptions}
        selected={task.snoozeUntil}
        noneLabel={snoozed ? "Un-snooze" : undefined}
        onPick={setSnooze}
      >
        <DateRow value={task.snoozeUntil} min={dateKeyDaysAhead(1)} onPick={setSnooze} />
      </PickerSheet>
      <PickerSheet open={picker === "due"} onClose={closePicker} title="Due" options={dueOptions} selected={task.due} noneLabel="No date" onPick={setDue}>
        <DateRow value={task.due} onPick={setDue} />
      </PickerSheet>
      <PickerSheet open={picker === "goal"} onClose={closePicker} title="Goal" options={goalOptions} selected={task.goalId} noneLabel="No goal" onPick={setGoal} />
    </>
  );
}
