/**
 * TaskDetail — the right slide-in panel for one task.
 *
 * Reads `detailTaskId` from the store and resolves the task from `tasks`;
 * renders nothing when there is no open task. Edits route through store actions
 * (`patchTask`, `setTaskStatus`, `deleteTask`) so every change persists. The
 * panel mirrors the prototype: a context/age header, an editable title saved on
 * blur, an Open/Done/Dropped segmented control, collapsible due / snooze / goal
 * rows, single-level subtasks, and a confirmed Delete (distinct from "dropped").
 */
import { useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import type { Attachment, Goal, IsoDate, Subtask, Task, TaskStatus } from "@/types";
import { useStore, selectSlate, SLATE_CAP } from "@/store";
import * as ipc from "@/lib/ipc";
import { ageInDays, dueLabel, formatShortDate, localToday } from "@/lib/dates";
import { confirmDestructive } from "@/lib/confirm";
import { AttachmentList, Checkbox, ContextDot, DatePicker, Icon, type IconName } from "@/components";
import { OptionRow } from "./OptionRow";
import { dateKeyDaysAhead } from "./dueDates";

/** Coerce a thrown value into a short user-facing message (mirrors the store's own convention). */
function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

/** Best-guess filename extension for a pasted file's MIME type (clipboard files often arrive unnamed). */
function extensionForMime(mime: string): string {
  const known: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return known[mime] ?? mime.split("/")[1] ?? "bin";
}

/** Which collapsible option menu is currently expanded. */
type Menu = "due" | "snooze" | "goal" | null;

/** Slightly longer than the slide-out (0.24s) so the panel unmounts after it finishes. */
const PANEL_EXIT_MS = 260;

/** Status segments, paired with their glyph; values are the lowercase domain enum. */
const STATUS_SEGMENTS: ReadonlyArray<{ value: TaskStatus; label: string; icon: IconName }> = [
  { value: "open", label: "Open", icon: "today" },
  { value: "done", label: "Done", icon: "check" },
  { value: "dropped", label: "Dropped", icon: "dropped" },
];

/** A long-form created date, e.g. "June 7". */
function createdLabel(createdIso: string): string {
  return new Date(createdIso).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/** A thin horizontal divider matching the prototype's section separators. */
function Divider(): JSX.Element {
  return <div className="mx-3 my-2.5 h-px bg-line" />;
}

/**
 * A textarea that grows to fit its content (no inner scrollbar), so the title
 * and details use the panel's vertical space instead of a cramped fixed box.
 * Uncontrolled: seeded from `defaultValue`, saved on blur, re-measured when the
 * task changes (keyed on `taskId`).
 */
function GrowTextarea({
  taskId,
  defaultValue,
  onBlur,
  placeholder,
  className,
}: {
  taskId: string;
  defaultValue: string;
  onBlur: (value: string) => void;
  placeholder?: string;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = (): void => {
    const el = ref.current;
    if (!el) return;
    // Collapsing to "auto" before reading scrollHeight briefly shrinks the
    // panel body, which clamps the `.scroll` ancestor's scrollTop — restoring
    // the final height afterwards otherwise leaves the view jumped. Capture
    // and restore it synchronously around the collapse so the user never sees
    // the jump.
    const scroller = el.closest<HTMLElement>(".scroll");
    const scrollTop = scroller?.scrollTop;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (scroller && scrollTop !== undefined) scroller.scrollTop = scrollTop;
  };

  useLayoutEffect(fit, [taskId]);

  return (
    <textarea
      key={taskId}
      ref={ref}
      defaultValue={defaultValue}
      onInput={fit}
      onBlur={(e) => onBlur(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={className}
    />
  );
}

/** A collapsible option row: a summary button plus an expandable body. */
function DetailRow({
  icon,
  value,
  placeholder,
  accent = false,
  open,
  onToggle,
  children,
}: {
  icon: IconName;
  value: string | null;
  placeholder: string;
  accent?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): JSX.Element {
  const iconColor = value ? (accent ? "text-accent" : "text-ink-2") : "text-ink-3";
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-100 hover:bg-raise ${
          open ? "bg-raise" : ""
        }`}
      >
        <span className={iconColor}>
          <Icon name={icon} size={16} />
        </span>
        <span className={`flex-1 text-sm ${value ? "text-ink" : "text-ink-3"}`}>
          {value || placeholder}
        </span>
      </button>
      {open && <div className="animate-fadeIn px-1.5 pb-2 pl-10 pt-0.5">{children}</div>}
    </div>
  );
}

/** A boxed group of option rows inside an expanded DetailRow. */
function MenuBox({ children }: { children: ReactNode }): JSX.Element {
  return <div className="rounded-md bg-surface-2 p-[5px]">{children}</div>;
}

/** Header: context + age summary and a close button. */
function DetailHeader({ task, onClose }: { task: Task; onClose: () => void }): JSX.Element {
  const age = ageInDays(task.created);
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
        <ContextDot context={task.context} size={7} />
        {task.context === "personal" ? "Personal" : "Office"}
        <span className="text-ink-3">·</span>
        <span>
          open {age} day{age === 1 ? "" : "s"}
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        title="Close (Esc)"
        className="rounded-[6px] p-1 text-ink-3 transition-colors duration-100 hover:bg-raise"
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}

/** Open / Done / Dropped segmented control. */
function StatusControl({
  status,
  onSet,
}: {
  status: TaskStatus;
  onSet: (status: TaskStatus) => void;
}): JSX.Element {
  return (
    <div className="mx-3 mb-2 flex gap-[3px] rounded-md bg-surface-2 p-[3px]">
      {STATUS_SEGMENTS.map((s) => {
        const active = status === s.value;
        const activeColor = s.value === "dropped" ? "text-ink-2" : "text-accent-ink";
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onSet(s.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[7px] py-2 text-[13px] font-semibold transition-all duration-150 ${
              active ? `bg-surface shadow-sm ${activeColor}` : "bg-transparent text-ink-3"
            }`}
          >
            <Icon name={s.icon} size={15} /> {s.label}
          </button>
        );
      })}
    </div>
  );
}

/** The subtasks section: progress count, toggleable items, and an add input. */
function Subtasks({
  subtasks,
  onToggle,
  onAdd,
}: {
  subtasks: Subtask[];
  onToggle: (id: string) => void;
  onAdd: (title: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const doneCount = subtasks.filter((s) => s.status === "done").length;

  const commit = (): void => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft("");
  };

  return (
    <div className="px-3">
      <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.07em] text-ink-3">
        Subtasks
        {subtasks.length > 0 && (
          <span className="text-ink-3">
            {" "}
            · {doneCount}/{subtasks.length}
          </span>
        )}
      </div>
      {subtasks.map((s) => {
        const done = s.status === "done";
        return (
          <div key={s.id} className="flex items-center gap-2.5 py-[5px]">
            <Checkbox checked={done} size={16} onClick={() => onToggle(s.id)} />
            <span
              className={`text-[13.5px] ${
                done ? "text-ink-3 line-through decoration-ink-3" : "text-ink"
              }`}
            >
              {s.title}
            </span>
          </div>
        );
      })}
      <div className="mt-0.5 flex items-center gap-2.5 py-[5px]">
        <span className="text-ink-3">
          <Icon name="plus" size={16} />
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          placeholder="Add subtask"
          className="flex-1 border-none bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>
    </div>
  );
}

/** The free-form details section: a notes textarea saved on blur. */
function Details({
  taskId,
  details,
  onSave,
}: {
  taskId: string;
  details: string;
  onSave: (details: string) => void;
}): JSX.Element {
  return (
    <div className="px-3">
      <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.07em] text-ink-3">
        Details
      </div>
      <GrowTextarea
        taskId={taskId}
        defaultValue={details}
        onBlur={onSave}
        placeholder="Add notes, links, or anything worth remembering…"
        className="min-h-[180px] w-full resize-none rounded-lg border border-line bg-surface-2 px-3.5 py-3 text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink-3"
      />
    </div>
  );
}

/** The attachments section: the current list plus an "Attach file" affordance. */
function Attachments({
  attachments,
  onOpen,
  onRemove,
  onAttach,
}: {
  attachments: Attachment[];
  onOpen: (attachment: Attachment) => void;
  onRemove: (attachment: Attachment) => void;
  onAttach: () => void;
}): JSX.Element {
  return (
    <div className="px-3">
      <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.07em] text-ink-3">
        Attachments
        {attachments.length > 0 && <span className="text-ink-3"> · {attachments.length}</span>}
      </div>
      <AttachmentList attachments={attachments} onOpen={onOpen} onRemove={onRemove} />
      <button
        type="button"
        onClick={onAttach}
        className="mt-0.5 flex w-full items-center gap-2.5 rounded-md py-[5px] text-left text-[13.5px] text-ink-3 transition-colors duration-100 hover:text-ink"
      >
        <Icon name="plus" size={16} />
        Attach file
      </button>
    </div>
  );
}

/**
 * A one-tap toggle that puts the task on today's slate (ADR-0009). Labelled and
 * always visible: this is the day's primary gesture, so it must not hide behind
 * a hover affordance. When the slate is full it says so rather than going
 * silently dead.
 */
function CommitToggle({
  on,
  full,
  onToggle,
}: {
  on: boolean;
  full: boolean;
  onToggle: () => void;
}): JSX.Element {
  const blocked = !on && full;
  return (
    <button
      type="button"
      disabled={blocked}
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-100 ${
        on ? "bg-accent-soft" : blocked ? "cursor-default" : "hover:bg-raise"
      }`}
    >
      <span className={on ? "text-accent" : "text-ink-3"}>
        <Icon name="today" size={16} />
      </span>
      <span className={`flex-1 text-sm ${on ? "text-ink" : "text-ink-3"}`}>
        {on
          ? "On today's slate"
          : blocked
            ? `Today's slate is full (${SLATE_CAP}) — free a slot first`
            : "Commit to today"}
      </span>
      {on && (
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
          Today
        </span>
      )}
    </button>
  );
}

/** A one-tap toggle that flags the task as priority (floats it + highlights it). */
function PriorityToggle({ on, onToggle }: { on: boolean; onToggle: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-100 ${
        on ? "bg-accent-soft" : "hover:bg-raise"
      }`}
    >
      <span className={on ? "text-accent" : "text-ink-3"}>
        <Icon name="flag" size={16} />
      </span>
      <span className={`flex-1 text-sm ${on ? "text-ink" : "text-ink-3"}`}>
        {on ? "Priority — surfaced on top" : "Mark as priority"}
      </span>
      {on && (
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
          On
        </span>
      )}
    </button>
  );
}

/** The confirmed delete control, distinct from the "dropped" status. */
function DeleteAction({ onDelete }: { onDelete: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onDelete}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-ink-3 transition-colors duration-100 hover:bg-raise hover:text-accent-ink"
    >
      <Icon name="trash" size={16} />
      <span className="flex-1">Delete task</span>
    </button>
  );
}

/** The slide-in task-detail panel, or null when no task is open. */
export function TaskDetail(): JSX.Element | null {
  const detailTaskId = useStore((s) => s.detailTaskId);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const theme = useStore((s) => s.theme);
  const patchTask = useStore((s) => s.patchTask);
  const toggleTaskCommit = useStore((s) => s.toggleTaskCommit);
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const deleteTask = useStore((s) => s.deleteTask);
  const closeTaskDetail = useStore((s) => s.closeTaskDetail);

  const [menu, setMenu] = useState<Menu>(null);

  const liveTask = detailTaskId ? tasks.find((t) => t.id === detailTaskId) : undefined;
  const open = liveTask != null;

  // Stay mounted through the slide-out so closing is animated, not abrupt.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const lastTaskRef = useRef<Task | undefined>(liveTask);
  if (liveTask) lastTaskRef.current = liveTask;

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
    }, PANEL_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Escape closes the panel from anywhere, not just when focus is inside it.
  // Listens on window so a click-away-then-Escape still works; the command
  // palette owns Escape while it's open, and surfaces layered above (the
  // scratchpad) stop the event before it reaches us.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || useStore.getState().paletteOpen) return;
      e.preventDefault();
      closeTaskDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeTaskDetail]);

  // Attach clipboard-pasted files one at a time, threading each new record through
  // `patchTask` so a multi-file paste doesn't drop earlier files to a stale merge.
  const attachPastedFiles = async (
    entityId: string,
    attachments: Attachment[],
    files: File[],
  ): Promise<void> => {
    let acc = attachments;
    for (const file of files) {
      try {
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        const name = file.name.trim() || `pasted-${Date.now()}.${extensionForMime(file.type)}`;
        const created = await ipc.attachBytes(entityId, name, bytes);
        acc = [...acc, created];
        await patchTask(entityId, { attachments: acc });
      } catch (err) {
        window.alert(`Couldn't attach the pasted file: ${errorMessageOf(err)}`);
      }
    }
  };

  // Paste-to-attach: only wired up while this task's panel is actually open.
  // Ordinary text paste (into the title/details/subtask fields) is untouched —
  // a clipboard paste with no files just falls through without preventDefault.
  useEffect(() => {
    if (!liveTask) return;
    const currentTask = liveTask;
    const handlePaste = (e: ClipboardEvent): void => {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      e.preventDefault();
      void attachPastedFiles(currentTask.id, currentTask.attachments, Array.from(files));
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // attachPastedFiles is stable in shape across renders (recreated but pure w.r.t. its args); only
    // liveTask identity should re-arm the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTask]);

  if (!mounted) return null;
  // While closing, keep rendering the task that was open until the slide finishes.
  const task = liveTask ?? lastTaskRef.current;
  if (!task) return null;

  const toggleMenu = (next: Exclude<Menu, null>): void =>
    setMenu((m) => (m === next ? null : next));

  const saveTitle = (title: string): void => {
    if (title !== task.title) void patchTask(task.id, { title });
  };

  const setDue = (due: IsoDate | null): void => {
    void patchTask(task.id, { due });
    setMenu(null);
  };

  const setSnooze = (snoozeUntil: IsoDate | null): void => {
    void patchTask(task.id, { snoozeUntil });
    setMenu(null);
  };

  const setGoal = (goalId: string | null): void => {
    void patchTask(task.id, { goalId });
    setMenu(null);
  };

  const setDetails = (details: string): void => {
    if (details !== task.details) void patchTask(task.id, { details });
  };

  const togglePriority = (): void => void patchTask(task.id, { priority: !task.priority });
  const slate = selectSlate(tasks);
  const onSlate = task.committedOn === localToday();

  const toggleSubtask = (subtaskId: string): void => {
    const subtasks = task.subtasks.map((s) =>
      s.id === subtaskId
        ? { ...s, status: s.status === "done" ? ("open" as const) : ("done" as const) }
        : s,
    );
    void patchTask(task.id, { subtasks });
  };

  const addSubtask = (title: string): void => {
    const subtask: Subtask = { id: crypto.randomUUID(), title, status: "open" };
    void patchTask(task.id, { subtasks: [...task.subtasks, subtask] });
  };

  const confirmDelete = async (): Promise<void> => {
    const ok = await confirmDestructive(`Delete “${task.title}”? This can't be undone.`);
    if (!ok) return;
    void deleteTask(task.id);
    closeTaskDetail();
  };

  /** Open the native file picker and attach whatever was chosen (cancel is a no-op). */
  const pickAndAttachFiles = async (): Promise<void> => {
    try {
      const selection = await openFilePicker({ multiple: true });
      if (!selection) return;
      const paths = Array.isArray(selection) ? selection : [selection];
      if (paths.length === 0) return;
      const created = await ipc.attachFiles(task.id, paths);
      await patchTask(task.id, { attachments: [...task.attachments, ...created] });
    } catch (err) {
      window.alert(`Couldn't attach the file: ${errorMessageOf(err)}`);
    }
  };

  /** Open an attachment in the OS default app. */
  const openAttachment = (attachment: Attachment): void => {
    void ipc.openAttachment(attachment.path).catch((err: unknown) => {
      window.alert(`Couldn't open “${attachment.name}”: ${errorMessageOf(err)}`);
    });
  };

  // No confirmation here (unlike confirmDelete): removing an attachment moves a
  // single file to the trash, not the whole task — low stakes and recoverable.
  /** Remove an attachment (moved to trash by the backend, not deleted outright). */
  const removeAttachment = (attachment: Attachment): void => {
    void (async () => {
      try {
        await ipc.removeAttachment(attachment.path);
        await patchTask(task.id, {
          attachments: task.attachments.filter((a) => a.path !== attachment.path),
        });
      } catch (err) {
        window.alert(`Couldn't remove “${attachment.name}”: ${errorMessageOf(err)}`);
      }
    })();
  };

  const dl = dueLabel(task.due);
  const linkedGoal: Goal | undefined = task.goalId
    ? goals.find((g) => g.id === task.goalId)
    : undefined;
  const snoozeValue = task.snoozeUntil ? `Hidden until ${formatShortDate(task.snoozeUntil)}` : null;
  const titleColor = task.status === "open" ? "text-ink" : "text-ink-2";
  const titleStrike = task.status === "done" ? "line-through decoration-ink-3" : "";

  return (
    <>
      <div
        onClick={closeTaskDetail}
        className={`fixed inset-0 z-40 bg-[rgba(20,18,15,.18)] ${
          closing ? "ng-overlay-out" : "ng-overlay-in"
        }`}
      />
      <aside
        style={{ colorScheme: theme }}
        className={`fixed bottom-0 right-0 top-0 z-[41] flex w-[460px] max-w-[92vw] flex-col border-l border-line bg-surface shadow ${
          closing ? "ng-panel-out" : "ng-panel-in"
        }`}
      >
        <DetailHeader task={task} onClose={closeTaskDetail} />

        <div className="scroll flex-1 px-4 pb-8 pt-4">
          <GrowTextarea
            taskId={task.id}
            defaultValue={task.title}
            onBlur={(v) => saveTitle(v.trim())}
            className={`mb-1 w-full resize-none border-none bg-transparent px-3 text-[21px] font-medium leading-[1.3] tracking-[-.015em] outline-none ${titleColor} ${titleStrike}`}
          />
          <div className="mb-3.5 px-3 text-[12.5px] text-ink-3">Created {createdLabel(task.created)}</div>

          <StatusControl status={task.status} onSet={(s) => void setTaskStatus(task.id, s)} />

          <Divider />

          {task.status === "open" && (
            <CommitToggle
              on={onSlate}
              full={slate.full}
              onToggle={() => void toggleTaskCommit(task.id)}
            />
          )}

          <PriorityToggle on={task.priority} onToggle={togglePriority} />

          <DetailRow
            icon="calendar"
            placeholder="Add due date"
            value={dl ? dl.text : null}
            accent={!!dl && dl.tone !== "normal"}
            open={menu === "due"}
            onToggle={() => toggleMenu("due")}
          >
            <MenuBox>
              <OptionRow icon="today" label="Today" onClick={() => setDue(dateKeyDaysAhead(0))} />
              <OptionRow
                icon="arrowRight"
                label="Tomorrow"
                onClick={() => setDue(dateKeyDaysAhead(1))}
              />
              <OptionRow
                icon="calendar"
                label="In a week"
                onClick={() => setDue(dateKeyDaysAhead(7))}
              />
              <div className="mt-1 border-t border-line pt-1.5">
                <DatePicker value={task.due} onPick={setDue} />
              </div>
              {task.due && (
                <OptionRow icon="x" label="Clear due date" danger onClick={() => setDue(null)} />
              )}
            </MenuBox>
          </DetailRow>

          <DetailRow
            icon="snooze"
            placeholder="Snooze — hide from Today until…"
            value={snoozeValue}
            open={menu === "snooze"}
            onToggle={() => toggleMenu("snooze")}
          >
            <MenuBox>
              <div className="px-2.5 pb-1.5 pt-1 text-xs text-ink-3">
                It stays an open task — just out of sight until then.
              </div>
              <OptionRow
                icon="arrowRight"
                label="Tomorrow"
                onClick={() => setSnooze(dateKeyDaysAhead(1))}
              />
              <OptionRow
                icon="calendar"
                label="Next week"
                onClick={() => setSnooze(dateKeyDaysAhead(7))}
              />
              <OptionRow
                icon="calendar"
                label="In a month"
                onClick={() => setSnooze(dateKeyDaysAhead(30))}
              />
              <div className="mt-1 border-t border-line pt-1.5">
                <DatePicker value={task.snoozeUntil} min={dateKeyDaysAhead(1)} onPick={setSnooze} />
              </div>
              {task.snoozeUntil && (
                <OptionRow icon="x" label="Un-snooze" danger onClick={() => setSnooze(null)} />
              )}
            </MenuBox>
          </DetailRow>

          <DetailRow
            icon="goals"
            placeholder="Link to a goal"
            value={linkedGoal ? linkedGoal.title : null}
            accent={!!linkedGoal}
            open={menu === "goal"}
            onToggle={() => toggleMenu("goal")}
          >
            <MenuBox>
              {goals.map((g) => (
                <OptionRow
                  key={g.id}
                  label={g.title}
                  active={task.goalId === g.id}
                  onClick={() => setGoal(g.id)}
                />
              ))}
              {task.goalId && <OptionRow icon="x" label="Unlink" danger onClick={() => setGoal(null)} />}
            </MenuBox>
          </DetailRow>

          <Divider />

          <Details taskId={task.id} details={task.details} onSave={setDetails} />

          <Divider />

          <Subtasks subtasks={task.subtasks} onToggle={toggleSubtask} onAdd={addSubtask} />

          <Divider />

          <Attachments
            attachments={task.attachments}
            onOpen={openAttachment}
            onRemove={removeAttachment}
            onAttach={() => void pickAndAttachFiles()}
          />

          <Divider />

          <DeleteAction onDelete={confirmDelete} />
        </div>
      </aside>
    </>
  );
}
