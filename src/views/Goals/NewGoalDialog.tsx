/**
 * NewGoalDialog — the modal for creating a Goal.
 *
 * Mirrors the command-palette overlay style: a centered card opened from the
 * Goals overview header. The user names the goal, picks its Context
 * (office | personal — seeded from the active filter), and may add an optional
 * target date and description. On create it persists via the store's `addGoal`
 * and navigates to the new goal's page. Esc / backdrop / Cancel dismiss it.
 */
import { useEffect, useRef, useState, type JSX } from "react";
import type { Context } from "@/types";
import { useStore } from "@/store";
import { ContextDot, Icon } from "@/components";

/** Collapse the global filter to a concrete write context (`all` → office). */
function defaultContext(filter: string): Context {
  return filter === "personal" ? "personal" : "office";
}

const CONTEXTS: ReadonlyArray<{ value: Context; label: string }> = [
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
];

export interface NewGoalDialogProps {
  open: boolean;
  onClose: () => void;
}

/** The create-goal modal, or null when closed. */
export function NewGoalDialog({ open, onClose }: NewGoalDialogProps): JSX.Element | null {
  const contextFilter = useStore((s) => s.contextFilter);
  const theme = useStore((s) => s.theme);
  const addGoal = useStore((s) => s.addGoal);
  const navigate = useStore((s) => s.navigate);

  const [title, setTitle] = useState("");
  const [context, setContext] = useState<Context>(() => defaultContext(contextFilter));
  const [target, setTarget] = useState("");
  const [description, setDescription] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the form and seed the context from the active filter on each open.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setTarget("");
    setContext(defaultContext(contextFilter));
    inputRef.current?.focus();
  }, [open, contextFilter]);

  if (!open) return null;

  const trimmed = title.trim();

  const create = async (): Promise<void> => {
    if (!trimmed) return;
    const goal = await addGoal({
      title: trimmed,
      context,
      description: description.trim() || undefined,
      target: target || null,
    });
    onClose();
    navigate("goal", goal.id);
  };

  return (
    <div
      onClick={onClose}
      className="animate-overlayIn fixed inset-0 z-[60] flex items-start justify-center bg-[rgba(20,18,15,.28)] pt-[16vh] backdrop-blur-[3px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ colorScheme: theme }}
        className="animate-riseIn w-[480px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-surface shadow"
      >
        <div className="flex items-center gap-3 border-b border-line px-[18px] py-4">
          <span className="text-accent">
            <Icon name="goals" size={20} />
          </span>
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Name your goal…"
            className="flex-1 border-none bg-transparent text-[16.5px] tracking-[-.01em] text-ink outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded-sm border border-line-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">
            esc
          </kbd>
        </div>

        <div className="flex flex-col gap-4 p-[18px]">
          <div className="flex items-center gap-3">
            <span className="w-[72px] text-[12.5px] font-medium text-ink-3">Context</span>
            <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
              {CONTEXTS.map((c) => {
                const active = context === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setContext(c.value)}
                    className={`flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                      active ? "bg-surface text-ink shadow-sm" : "bg-transparent text-ink-3"
                    }`}
                  >
                    <ContextDot context={c.value} size={6} /> {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-[72px] text-[12.5px] font-medium text-ink-3">Target</span>
            <input
              type="date"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-ink-2 outline-none"
            />
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does reaching this goal look like? (optional)"
            rows={3}
            className="w-full resize-y rounded-md bg-surface-2 px-3 py-2.5 text-[13.5px] leading-[1.55] text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-[18px] py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-raise"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void create()}
            disabled={!trimmed}
            className="rounded-md bg-accent px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-px disabled:opacity-40 disabled:hover:translate-y-0"
          >
            Create goal
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewGoalDialog;
