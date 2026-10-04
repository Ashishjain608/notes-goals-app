/**
 * Composer — the phone's capture card above the keyboard (ADR-0012, plan §2).
 * Opened from the FAB menu via `phoneOverlay = { kind: "composer", mode }`.
 *
 * Task and Goal text is read by `parseCapture` ("tomorrow", "#personal",
 * "#<goal>"); what it found shows as chips under the field. A chip opens its
 * picker; its × removes the choice (and the words that set it). Explicit picks
 * win over parsed ones. After a save the card stays open for the next item.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useStore, selectSlate, type PhoneOverlay } from "@/store";
import { ContextDot, Icon, type IconName } from "@/components";
import { PickerSheet, type PickerOption } from "@/components/PickerSheet";
import { SegmentedControl } from "@/components/SegmentedControl";
import type { Context, IsoDate } from "@/types";
import { dueLabel, formatShortDate, localToday } from "@/lib/dates";
import { dateKeyDaysAhead } from "@/views/Capture/dueDates";
import { useKeyboardInset } from "@/lib/keyboard";
import { usePhoneLayer } from "@/lib/phoneHistory";
import { parseCapture, type CaptureToken } from "@/lib/parseCapture";
import { continueChecklist, cutRange, isBlankBody } from "./composerText";

type Mode = "task" | "note" | "goal";
type Picker = "date" | "context" | "goal" | "notebook";

/** Explicit chip choices; `undefined` = not chosen, so the parsed value (if any) applies. */
interface Choices {
  due?: IsoDate;
  context?: Context;
  goalId?: string;
  notebookId?: string;
}

const MODES = [
  { value: "task", label: "Task" },
  { value: "note", label: "Note" },
  { value: "goal", label: "Goal" },
] as const;

const CONTEXTS: PickerOption[] = [
  { value: "office", label: "Office", context: "office" },
  { value: "personal", label: "Personal", context: "personal" },
];

const keep = (e: { preventDefault: () => void }) => e.preventDefault(); // tap without blurring the field

// ponytail: module-level draft, so a stray scrim tap or swipe-back doesn't lose typing; in-memory only (not across reloads).
let draft = { text: "", body: "" };

export function Composer(): JSX.Element | null {
  const overlay = useStore((s) => s.phoneOverlay);
  const setPhoneOverlay = useStore((s) => s.setPhoneOverlay);
  const open = overlay?.kind === "composer";
  const close = () => setPhoneOverlay(null);
  usePhoneLayer("composer", open, close);
  return open ? <ComposerCard overlay={overlay} onClose={close} /> : null;
}

function ComposerCard({
  overlay,
  onClose,
}: {
  overlay: Extract<PhoneOverlay, { kind: "composer" }>;
  onClose: () => void;
}): JSX.Element {
  const goals = useStore((s) => s.goals);
  const notebooks = useStore((s) => s.notebooks);
  const tasks = useStore((s) => s.tasks);
  const slateCap = useStore((s) => s.slateCap);
  const contextFilter = useStore((s) => s.contextFilter);
  const screen = useStore((s) => s.route.screen);
  const inset = useKeyboardInset();

  const prefillGoal = goals.find((g) => g.id === overlay.goalId);
  const [mode, setMode] = useState<Mode>(overlay.mode === "checklist" ? "note" : overlay.mode);
  const [text, setText] = useState(draft.text);
  const [body, setBody] = useState(
    isBlankBody(draft.body) ? (overlay.mode === "checklist" ? "- [ ] " : "") : draft.body,
  );
  useEffect(() => {
    draft = { text, body };
  }, [text, body]);
  const [choices, setChoices] = useState<Choices>(
    prefillGoal ? { goalId: prefillGoal.id, context: prefillGoal.context } : {},
  );
  const slate = useMemo(() => selectSlate(tasks, slateCap), [tasks, slateCap]);
  const [toSlate, setToSlate] = useState(screen === "today");
  const slateOn = toSlate && !slate.full;
  const [picker, setPicker] = useState<Picker | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // state lags a double-tap; this doesn't
  const fieldRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  usePhoneLayer("composer-picker", picker !== null, () => setPicker(null));

  // Land in the first field on open and on every mode switch.
  useEffect(() => fieldRef.current?.focus(), [mode]);

  // Escape closes the card, unless a picker sheet is up (it closes itself first).
  useEffect(() => {
    if (picker) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picker, onClose]);

  const activeGoals = goals.filter((g) => g.status === "active" || g.status === "onhold");
  // Notes are filed with chips, not parsed: a note title often holds a date.
  const parsed = mode === "note" ? null : parseCapture(text, { goals: mode === "task" ? activeGoals : [] });
  const tokenOf = (kind: CaptureToken["kind"]) => parsed?.tokens.find((t) => t.kind === kind);
  const chosen = { date: choices.due !== undefined, context: choices.context !== undefined, goal: choices.goalId !== undefined };

  const due = choices.due !== undefined ? choices.due : (parsed?.due ?? null);
  const pickedGoal =
    mode === "goal" ? undefined : goals.find((g) => g.id === (choices.goalId !== undefined ? choices.goalId : parsed?.goalId));
  const context: Context =
    choices.context ?? parsed?.context ?? pickedGoal?.context ?? (contextFilter === "all" ? "personal" : contextFilter);
  // A goal of the other context is dropped (its chip reads empty), as for notes (CONTEXT.md).
  const goal = pickedGoal?.context === context ? pickedGoal : undefined;
  const goalId = goal?.id ?? null;
  const notebookId = mode === "note" ? (choices.notebookId ?? null) : null;
  const notebook = notebooks.find((n) => n.id === notebookId);
  // Words that set something are cut from the title, unless a chip choice overrides them: then they stay as typed.
  const title = (parsed?.tokens ?? [])
    .filter((t) => !chosen[t.kind])
    .reduceRight((t, k) => cutRange(t, k.start, k.end), text)
    .replace(/\s+/g, " ")
    .trim();
  const canSave = !busy && (mode === "note" ? title !== "" || !isBlankBody(body) : title !== "");

  /** Apply a choice; drop the words that had set it, and any filing the new context no longer allows. */
  const choose = (kind: Picker, patch: Choices, keepOpen = false): void => {
    const tok = tokenOf(kind === "context" ? "context" : kind === "goal" ? "goal" : "date");
    if (tok && kind !== "notebook") setText((t) => cutRange(t, tok.start, tok.end));
    setChoices((c) => {
      const next = { ...c, ...patch };
      const ctx = next.context ?? context;
      if (next.goalId && goals.find((g) => g.id === next.goalId)?.context !== ctx) next.goalId = undefined;
      if (next.notebookId && notebooks.find((n) => n.id === next.notebookId)?.context !== ctx) next.notebookId = undefined;
      return next;
    });
    if (!keepOpen) setPicker(null);
  };

  const reset = (): void => {
    setText("");
    setBody((b) => (b.startsWith("- [ ] ") ? "- [ ] " : ""));
    // Keep where things are going; clear what was about this one item.
    setChoices((c) => ({ context: c.context, goalId: c.goalId, notebookId: c.notebookId }));
    fieldRef.current?.focus();
  };

  const save = async (openEditor = false): Promise<void> => {
    if (busyRef.current || (!canSave && !openEditor)) return;
    const s = useStore.getState();
    busyRef.current = true;
    setBusy(true);
    try {
      if (mode === "task") {
        const created = await s.addTask({ title, context, due, goalId }, { openDetail: false });
        // The task exists now: a failed commit must not read as a failed save (a retry would duplicate it).
        const committed = slateOn && (await s.toggleTaskCommit(created.id).catch(() => false));
        setStatus(
          slateOn && !committed ? `Added “${title}”, but couldn't put it on today's slate.` : `Added “${title}”${committed ? " to today's slate" : ""}`,
        );
      } else if (mode === "goal") {
        await s.addGoal({ title, context, target: due });
        setStatus(`Added goal “${title}”`);
      } else {
        const created = await s.addNote({ title: title || "Untitled", context, goalId, notebookId, body: isBlankBody(body) ? "" : body });
        if (openEditor) {
          onClose();
          s.navigate("notes");
          s.selectNote(created.id);
          return;
        }
        setStatus(`Saved “${title || "Untitled"}”`);
      }
      reset();
    } catch {
      setStatus("Couldn't save. Your text is still here; try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const chip = (kind: Picker, icon: IconName | null, label: string | null, tone: string, removable: boolean, ctx?: Context) => (
    <div key={kind} className={`flex h-11 items-center rounded-full ${label ? tone : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line-2)]"}`}>
      <button
        type="button"
        onClick={() => setPicker(kind)}
        className={`flex h-11 items-center gap-1.5 text-[15px] font-medium ${label && removable ? "pl-3.5" : "px-3.5"}`}
      >
        {ctx ? <ContextDot context={ctx} size={9} /> : icon && <Icon name={label ? icon : "plus"} size={16} />}
        {label ?? { date: mode === "goal" ? "Target date" : "Date", context: "Context", goal: "Goal", notebook: "Notebook" }[kind]}
      </button>
      {label && removable && (
        <button
          type="button"
          aria-label={`Remove ${kind}`}
          onPointerDown={keep}
          // Back to "not chosen", so typing a new date or #goal works again.
          onClick={() => choose(kind, { [kind === "date" ? "due" : kind === "goal" ? "goalId" : "notebookId"]: undefined })}
          className="grid h-11 w-11 place-items-center opacity-70"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );

  const dateText = due ? (mode === "goal" ? `By ${formatShortDate(due)}` : dueLabel(due)!.text) : null;
  const ctxTone = context === "office" ? "bg-accent-soft text-accent-ink" : "bg-ctx-personal-soft text-ctx-personal";
  const bottom = inset > 0 ? `${inset + 10}px` : "max(12px, env(safe-area-inset-bottom))";
  const field = "w-full border-none bg-transparent text-[19px] text-ink caret-accent outline-none placeholder:text-ink-3";

  return (
    <>
      <div className="ng-overlay-in fixed inset-0 z-50 bg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={`New ${mode}`}
        className="fixed left-3 right-3 z-50 flex flex-col items-end gap-2"
        style={{ bottom }}
      >
        {mode === "task" && (
          <button
            type="button"
            aria-pressed={slateOn}
            disabled={slate.full}
            onPointerDown={keep}
            onClick={() => setToSlate((v) => !v)}
            className="flex h-11 items-center gap-2 rounded-[22px] bg-glass px-4 text-[14px] font-semibold text-accent-ink shadow-glass backdrop-blur-[20px] disabled:text-ink-2"
          >
            <span className={`grid h-5 w-5 place-items-center rounded-full ${slateOn ? "bg-accent text-white [[data-theme=spectrum-dark]_&]:text-bg" : "shadow-[inset_0_0_0_1.5px_currentColor]"}`}>
              {slateOn && <Icon name="check" size={14} />}
            </span>
            {slate.full ? "Slate is full" : "Add to slate"}
            <span className="font-medium text-ink-2">· {slate.count} of {slate.cap}</span>
          </button>
        )}
        <div className="flex max-h-[calc(100dvh-120px)] w-full flex-col gap-3 overflow-y-auto rounded-[28px] bg-glass px-3.5 pb-3.5 pt-4 shadow-glass backdrop-blur-[20px]">
          {mode === "note" && (
            <div className="-mt-2.5 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-2">{body.startsWith("- [ ] ") ? "Checklist" : "Quick note"}</span>
              <button
                type="button"
                disabled={busy}
                onPointerDown={keep}
                onClick={() => void save(true)}
                className="flex h-11 items-center gap-0.5 text-[14px] font-semibold text-accent-ink"
              >
                Open full editor <Icon name="chevron" size={16} />
              </button>
            </div>
          )}
          <input
            ref={fieldRef}
            aria-label={mode === "note" ? "Note title" : `${mode === "task" ? "Task" : "Goal"} title`}
            enterKeyHint={mode === "note" ? "next" : "done"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (mode === "note") bodyRef.current?.focus();
              else void save();
            }}
            placeholder={mode === "task" ? "New task. Try “tomorrow” or #personal" : mode === "goal" ? "New goal. Try “by Dec 1”" : "Title"}
            className={`${field} ${mode === "note" ? "font-semibold" : ""}`}
          />
          {mode === "note" && (
            <textarea
              ref={bodyRef}
              aria-label="Note body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                const next = continueChecklist(body, e.currentTarget.selectionStart);
                if (!next) return;
                e.preventDefault();
                const el = e.currentTarget;
                setBody(next.value);
                requestAnimationFrame(() => el.setSelectionRange(next.caret, next.caret));
              }}
              placeholder="Write something…"
              className={`${field} resize-none font-serif text-[18px] leading-[1.5]`}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {mode !== "note" && chip("date", "calendar", dateText, "bg-accent-soft text-accent-ink", true)}
            {chip("context", null, context === "office" ? "Office" : "Personal", ctxTone, false, context)}
            {mode === "note" && chip("notebook", "notebook", notebook ? notebook.name : null, "bg-ink-6 text-ink", true)}
            {mode !== "goal" && chip("goal", "goals", goal ? goal.title : null, "bg-ink-6 text-ink", true)}
          </div>
          {status && (
            <p aria-live="polite" className="px-1 text-[13px] text-ink-2">
              {status}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <SegmentedControl label="Add a" options={MODES} value={mode} onChange={(m) => { setMode(m); setStatus(null); }} />
            <button
              type="button"
              aria-label={`Save ${mode}`}
              disabled={!canSave}
              onPointerDown={keep}
              onClick={() => void save()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40 [[data-theme=spectrum-dark]_&]:text-bg"
            >
              <Icon name="check" size={22} />
            </button>
          </div>
        </div>
      </div>

      <PickerSheet
        open={picker === "date"}
        onClose={() => setPicker(null)}
        title={mode === "goal" ? "Target date" : "Due date"}
        options={[
          { value: dateKeyDaysAhead(0), label: "Today" },
          { value: dateKeyDaysAhead(1), label: "Tomorrow" },
          { value: dateKeyDaysAhead((8 - new Date().getDay()) % 7 || 7), label: "Next week" }, // next Monday
        ].map((o) => ({ ...o, hint: formatShortDate(o.value) ?? undefined }))}
        selected={due}
        noneLabel="No date"
        onPick={(v) => choose("date", { due: v ?? undefined })}
      >
        <label className="flex min-h-[52px] items-center gap-3 px-3 text-[16px] text-ink">
          Pick a date
          <input
            type="date"
            min={localToday()}
            value={due ?? ""}
            // iOS may fire change while the wheels spin: keep the sheet open; Done closes it.
            onChange={(e) => e.target.value && choose("date", { due: e.target.value }, true)}
            className="ml-auto h-11 rounded-xl bg-surface-2 px-3 text-[16px] text-ink"
          />
        </label>
      </PickerSheet>
      <PickerSheet
        open={picker === "context"}
        onClose={() => setPicker(null)}
        title="Context"
        options={CONTEXTS}
        selected={context}
        onPick={(v) => v && choose("context", { context: v as Context })}
      />
      <PickerSheet
        open={picker === "goal"}
        onClose={() => setPicker(null)}
        title="Goal"
        options={activeGoals
          .filter((g) => mode === "task" || g.context === context)
          .map((g) => ({ value: g.id, label: g.title, context: g.context }))}
        selected={goalId}
        noneLabel="No goal"
        // A task follows its goal's context; a note may only link a goal of its own.
        onPick={(v) => choose("goal", { goalId: v ?? undefined, ...(v ? { context: goals.find((g) => g.id === v)!.context } : {}) })}
      />
      <PickerSheet
        open={picker === "notebook"}
        onClose={() => setPicker(null)}
        title="Notebook"
        options={notebooks.filter((n) => n.context === context).map((n) => ({ value: n.id, label: n.name }))}
        selected={notebookId}
        noneLabel="Unfiled"
        onPick={(v) => choose("notebook", { notebookId: v ?? undefined })}
      />
    </>
  );
}
