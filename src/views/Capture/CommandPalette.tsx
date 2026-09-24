/**
 * CommandPalette — the ⌘K quick-capture / search / navigation overlay.
 *
 * Reads its own open state from the store (`paletteOpen`) and renders nothing
 * when closed. An empty input shows "Jump to" rows. Typing searches everything
 * — tasks, note titles AND bodies, goals, notebooks — while keeping "Add task"
 * as the first, pre-selected row, so Enter after typing still captures exactly
 * as it always has. Arrow keys move the selection; Enter activates it.
 *
 * Note bodies are lazy (ADR-0006), so they're searched in Rust via the store's
 * `searchNoteBodies` on a short debounce and merged in by `searchAll`.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { Context, NoteBodyHit } from "@/types";
import type { Screen } from "@/store";
import type { IconName } from "@/components";
import { useStore } from "@/store";
import { Icon } from "@/components";
import { searchAll, MIN_QUERY, type SearchHit, type SearchKind } from "@/lib/search";
import { OptionRow } from "./OptionRow";

/** How long typing has to settle before the note bodies are read off disk. */
const BODY_SEARCH_DEBOUNCE_MS = 140;

/** Collapse the global filter to a concrete write context (`all` → office). */
function defaultContext(filter: string): Context {
  return filter === "personal" ? "personal" : "office";
}

/** The navigation targets shown when the input is empty. */
const JUMPS: ReadonlyArray<{ screen: Screen; label: string; icon: IconName }> = [
  { screen: "today", label: "Today", icon: "today" },
  { screen: "tasks", label: "All Tasks", icon: "tasks" },
  { screen: "activity", label: "Activity", icon: "clock" },
  { screen: "notes", label: "Notes", icon: "notes" },
  { screen: "goals", label: "Goals", icon: "goals" },
];

const KIND_ICON: Record<SearchKind, IconName> = {
  task: "tasks",
  note: "notes",
  goal: "goals",
  notebook: "notebook",
};

const KIND_LABEL: Record<SearchKind, string> = {
  task: "Task",
  note: "Note",
  goal: "Goal",
  notebook: "Notebook",
};

/** The ⌘K command palette. */
export function CommandPalette(): JSX.Element | null {
  const open = useStore((s) => s.paletteOpen);
  const contextFilter = useStore((s) => s.contextFilter);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const goals = useStore((s) => s.goals);
  const notebooks = useStore((s) => s.notebooks);
  const addTask = useStore((s) => s.addTask);
  const closePalette = useStore((s) => s.closePalette);
  const navigate = useStore((s) => s.navigate);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const selectNote = useStore((s) => s.selectNote);
  const searchNoteBodies = useStore((s) => s.searchNoteBodies);

  const [title, setTitle] = useState("");
  const [bodyHits, setBodyHits] = useState<NoteBodyHit[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = title.trim();

  // Reset + focus the input each time the palette opens.
  useEffect(() => {
    if (open) {
      setTitle("");
      setBodyHits([]);
      setSelected(0);
      inputRef.current?.focus();
    }
  }, [open]);

  // Note bodies live on disk; fetch matches after typing settles. A failure
  // (no vault yet, unreadable file) simply means no body hits, never a crash.
  useEffect(() => {
    if (!open || trimmed.length < MIN_QUERY) {
      setBodyHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchNoteBodies(trimmed)
        .then((hits) => {
          if (!cancelled) setBodyHits(hits);
        })
        .catch(() => {
          if (!cancelled) setBodyHits([]);
        });
    }, BODY_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, trimmed, searchNoteBodies]);

  const hits = useMemo(
    () => searchAll(trimmed, { tasks, notes, goals, notebooks }, bodyHits),
    [trimmed, tasks, notes, goals, notebooks, bodyHits],
  );

  // Keep the selection in range as results arrive or narrow.
  useEffect(() => {
    setSelected((i) => Math.min(i, hits.length));
  }, [hits.length]);

  if (!open) return null;

  const context = defaultContext(contextFilter);

  const submitAdd = (): void => {
    if (!trimmed) return;
    void addTask({ title: trimmed, context });
    closePalette();
  };

  const openHit = (hit: SearchHit): void => {
    switch (hit.kind) {
      case "task":
        openTaskDetail(hit.id);
        break;
      case "note":
        selectNote(hit.id);
        navigate("notes");
        break;
      case "goal":
        navigate("goal", hit.id);
        break;
      case "notebook":
        navigate("notes");
        break;
    }
    closePalette();
  };

  /** Row 0 is always "Add task"; rows 1..n are search hits. */
  const activate = (index: number): void => {
    if (index === 0) submitAdd();
    else {
      const hit = hits[index - 1];
      if (hit) openHit(hit);
    }
  };

  const jumpTo = (screen: Screen): void => {
    navigate(screen);
    closePalette();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      closePalette();
      return;
    }
    if (!trimmed) return;
    if (e.key === "Enter") {
      e.preventDefault();
      activate(selected);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, hits.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    }
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
            <Icon name={trimmed ? "search" : "plus"} size={20} />
          </span>
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search anything, or add a task…"
            className="flex-1 border-none bg-transparent text-[16.5px] tracking-[-.01em] text-ink outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded-sm border border-line-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">
            esc
          </kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {trimmed ? (
            <>
              <OptionRow
                icon="plus"
                selected={selected === 0}
                label={
                  <span>
                    Add task <strong>“{trimmed}”</strong>
                  </span>
                }
                sub={context === "personal" ? "Personal" : "Office"}
                onClick={submitAdd}
              />

              {hits.length > 0 && (
                <div className="px-2.5 pb-1 pt-2 text-[11px] uppercase tracking-[.06em] text-ink-3">
                  Results
                </div>
              )}
              {hits.map((hit, i) => (
                <OptionRow
                  key={`${hit.kind}-${hit.id}`}
                  icon={KIND_ICON[hit.kind]}
                  selected={selected === i + 1}
                  label={
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{hit.title}</span>
                      {hit.sub && <span className="truncate text-xs text-ink-3">{hit.sub}</span>}
                    </span>
                  }
                  sub={KIND_LABEL[hit.kind]}
                  onClick={() => openHit(hit)}
                />
              ))}

              {hits.length === 0 && trimmed.length >= MIN_QUERY && (
                <div className="px-2.5 py-2 text-[13px] text-ink-3">
                  Nothing else matches “{trimmed}”.
                </div>
              )}
            </>
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
