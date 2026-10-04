/**
 * FilingChip + FilingSheet — the phone editor's single "where does this note
 * live" control (ADR-0012, ADR-0008). The chip reads "Product · Q3 board deck ·
 * Office"; tapping it opens a sheet: Context first, then Notebook and Goal
 * limited to that context (a notebook/goal only holds notes of its own context).
 *
 * Every write goes through the editor's `saveWith(patch)`, which cancels the
 * pending autosave and saves the live body + working title + patch in ONE write.
 * (A separate moveNoteToNotebook would race a pending autosave that still
 * carries the old notebook/goal.)
 */
import { useEffect, useMemo, useState, type JSX } from "react";
import type { Context, Note } from "@/types";
import { reconcileNoteGoal, reconcileNoteNotebook, useStore } from "@/store";
import { ContextDot, Icon } from "@/components";
import { BottomSheet } from "@/components/BottomSheet";
import { SegmentedControl } from "@/components/SegmentedControl";

const CONTEXTS = [
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
] as const;

export interface FilingChipProps {
  note: Note;
  /** The editor's `saveWith`. */
  saveWith: (patch: Partial<Note>) => boolean;
  /** Disabled until the body has loaded (saving earlier would blank it). */
  disabled?: boolean;
  /** Context can't change here (the goal drawer). */
  fixedContext?: boolean;
  /** Goal can't change here (the goal drawer's note belongs to its goal). */
  lockGoal?: boolean;
}

const ROW = "flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[16px] text-ink active:bg-raise";

function Choice({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={ROW}>
      <span className={`min-w-0 truncate ${on ? "font-semibold" : ""}`}>{label}</span>
      <span className={`ml-auto shrink-0 text-accent-ink ${on ? "" : "invisible"}`}>
        <Icon name="check" size={20} />
      </span>
    </button>
  );
}

export function FilingChip({ note, saveWith, disabled = false, fixedContext = false, lockGoal = false }: FilingChipProps): JSX.Element {
  const notebooks = useStore((s) => s.notebooks);
  const goals = useStore((s) => s.goals);
  const [open, setOpen] = useState(false);
  // Local copy so each tap shows at once; re-seeded whenever the sheet opens.
  const [draft, setDraft] = useState({ context: note.context, notebookId: note.notebookId, goalId: note.goalId });
  useEffect(() => {
    if (open) setDraft({ context: note.context, notebookId: note.notebookId, goalId: note.goalId });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open
  }, [open]);

  const current = reconcileNoteNotebook(note, notebooks);
  const notebook = notebooks.find((n) => n.id === current.notebookId);
  const goal = goals.find((g) => g.id === note.goalId);
  const label = [notebook?.name ?? "Unfiled", goal?.title, note.context === "personal" ? "Personal" : "Office"]
    .filter(Boolean)
    .join(" · ");

  const books = useMemo(
    () =>
      notebooks
        .filter((n) => n.context === draft.context)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [notebooks, draft.context],
  );
  const openGoals = useMemo(
    () => goals.filter((g) => g.context === draft.context && (g.status === "active" || g.status === "onhold" || g.id === draft.goalId)),
    [goals, draft.context, draft.goalId],
  );

  const apply = (patch: Partial<Note>): void => {
    // Reconcile first so the sheet and the saved note agree (the store would do the same).
    const next = reconcileNoteGoal(reconcileNoteNotebook({ ...note, ...draft, ...patch }, notebooks), goals);
    const filed = { context: next.context, notebookId: next.notebookId, goalId: next.goalId };
    if (saveWith(filed)) setDraft(filed); // refused save (body not loaded): keep showing what's on disk
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={`Filed under ${label}. Change`}
        title="Change where this note is filed"
        className="flex min-h-[44px] min-w-0 items-center disabled:opacity-40"
      >
        <span className="flex h-[34px] min-w-0 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-[14px] font-medium text-ink">
          <ContextDot context={note.context} size={8} />
          <span className="min-w-0 truncate">{label}</span>
          <Icon name="chevronDown" size={14} className="shrink-0 text-ink-3" />
        </span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="File note">
        <div className="flex flex-col gap-1 pb-3">
          {!fixedContext && (
            <div className="pb-2">
              <SegmentedControl
                label="Context"
                options={CONTEXTS}
                value={draft.context}
                onChange={(context: Context) => apply({ context })}
              />
            </div>
          )}
          <p className="px-3 pt-1 text-[13px] font-medium text-ink-2">Notebook</p>
          <Choice label="Unfiled" on={draft.notebookId === null} onClick={() => apply({ notebookId: null })} />
          {books.map((b) => (
            <Choice key={b.id} label={b.name} on={draft.notebookId === b.id} onClick={() => apply({ notebookId: b.id })} />
          ))}
          {!lockGoal && (
            <>
              <p className="px-3 pt-3 text-[13px] font-medium text-ink-2">Goal</p>
              <Choice label="No goal" on={draft.goalId === null} onClick={() => apply({ goalId: null })} />
              {openGoals.map((g) => (
                <Choice key={g.id} label={g.title} on={draft.goalId === g.id} onClick={() => apply({ goalId: g.id })} />
              ))}
            </>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
