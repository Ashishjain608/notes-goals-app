/**
 * CommandPalette — the ⌘K quick-capture / navigation overlay.
 *
 * Reads its own open state from the store (`paletteOpen`) and renders nothing
 * when closed. Typing a title and pressing Enter adds an open task in the
 * filter's context (`all` → office) and closes; an empty input instead shows
 * "Jump to" rows that navigate between screens. Esc, backdrop click, and any
 * action close the palette. The input auto-focuses each time it opens.
 */
import { useEffect, useRef, useState, type JSX } from "react";
import type { Context } from "@/types";
import type { Screen } from "@/store";
import type { IconName } from "@/components";
import { useStore } from "@/store";
import { Icon } from "@/components";
import { OptionRow } from "./OptionRow";

/** Collapse the global filter to a concrete write context (`all` → office). */
function defaultContext(filter: string): Context {
  return filter === "personal" ? "personal" : "office";
}

/** The navigation targets shown when the input is empty. */
const JUMPS: ReadonlyArray<{ screen: Screen; label: string; icon: IconName }> = [
  { screen: "today", label: "Today", icon: "today" },
  { screen: "tasks", label: "All Tasks", icon: "tasks" },
  { screen: "notes", label: "Notes", icon: "notes" },
  { screen: "goals", label: "Goals", icon: "goals" },
];

/** The ⌘K command palette. */
export function CommandPalette(): JSX.Element | null {
  const open = useStore((s) => s.paletteOpen);
  const contextFilter = useStore((s) => s.contextFilter);
  const addTask = useStore((s) => s.addTask);
  const closePalette = useStore((s) => s.closePalette);
  const navigate = useStore((s) => s.navigate);

  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset + focus the input each time the palette opens.
  useEffect(() => {
    if (open) {
      setTitle("");
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const context = defaultContext(contextFilter);
  const trimmed = title.trim();

  const submit = (): void => {
    if (!trimmed) return;
    void addTask({ title: trimmed, context });
    closePalette();
  };

  const jumpTo = (screen: Screen): void => {
    navigate(screen);
    closePalette();
  };

  return (
    <div
      onClick={closePalette}
      className="animate-overlayIn fixed inset-0 z-[60] flex items-start justify-center bg-[rgba(20,18,15,.28)] pt-[16vh] backdrop-blur-[3px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-riseIn w-[560px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-surface shadow"
      >
        <div className="flex items-center gap-3 border-b border-line px-[18px] py-4">
          <span className="text-accent">
            <Icon name="plus" size={20} />
          </span>
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") closePalette();
            }}
            placeholder="Add a task, or type to jump…"
            className="flex-1 border-none bg-transparent text-[16.5px] tracking-[-.01em] text-ink outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded-sm border border-line-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">
            esc
          </kbd>
        </div>
        <div className="p-2">
          {trimmed ? (
            <OptionRow
              icon="plus"
              label={
                <span>
                  Add task <strong>“{trimmed}”</strong>
                </span>
              }
              sub={context === "personal" ? "Personal" : "Office"}
              onClick={submit}
            />
          ) : (
            <>
              <div className="px-2.5 py-1 text-[11px] uppercase tracking-[.06em] text-ink-3">
                Jump to
              </div>
              {JUMPS.map((j) => (
                <OptionRow
                  key={j.screen}
                  icon={j.icon}
                  label={j.label}
                  onClick={() => jumpTo(j.screen)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
