/**
 * QuickAddInline — the always-visible inline add bar embedded under a screen's
 * header (Today / Backlog). Typing a title and pressing Enter creates an open
 * task in the chosen context; the task then lives in the list until it is
 * finished or dropped.
 *
 * The context toggle defaults to the active global filter, falling back to
 * "office" when the filter is "all". It tracks the global filter while the user
 * has not made a per-bar override of their own context.
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

/** The inline quick-add bar. */
export function QuickAddInline(): JSX.Element {
  const contextFilter = useStore((s) => s.contextFilter);
  const addTask = useStore((s) => s.addTask);

  const [title, setTitle] = useState("");
  const [context, setContext] = useState<Context>(() => defaultContext(contextFilter));
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the global filter whenever it selects a concrete context.
  useEffect(() => {
    if (contextFilter !== "all") setContext(contextFilter);
  }, [contextFilter]);

  const submit = (): void => {
    const trimmed = title.trim();
    if (!trimmed) return;
    void addTask({ title: trimmed, context });
    setTitle("");
  };

  return (
    <div className="mx-4 flex items-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-[11px] shadow-sm max-md:flex-wrap max-md:px-3">
      <span className="text-ink-3">
        <Icon name="plus" size={18} />
      </span>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Add a task — it stays here until you finish it"
        className="min-w-0 flex-1 max-md:min-w-[calc(100%-32px)] border-none bg-transparent text-[14.5px] max-md:h-11 max-md:text-[16px] tracking-[-.005em] text-ink outline-none placeholder:text-ink-3"
      />
      <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5 max-md:flex-1">
        {CONTEXTS.map((c) => {
          const active = context === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setContext(c.value)}
              className={`flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs max-md:min-h-[40px] max-md:flex-1 max-md:justify-center max-md:text-[13px] font-medium transition-colors duration-150 ${
                active ? "bg-surface text-ink shadow-sm" : "bg-transparent text-ink-3"
              }`}
            >
              <ContextDot context={c.value} size={6} /> {c.label}
            </button>
          );
        })}
      </div>
      <kbd className="font-mono text-[11px] text-ink-3 max-md:hidden">↵</kbd>
      <button
        type="button"
        onClick={submit}
        disabled={!title.trim()}
        className="hidden min-h-[44px] rounded-md bg-accent px-4 text-[14px] font-semibold text-white disabled:opacity-40 max-md:block"
      >
        Add
      </button>
    </div>
  );
}
