/**
 * SearchOverlay — the phone's full-screen, bottom-anchored search (Final 2).
 *
 * Open state is the store's `paletteOpen`. The field sits above the keyboard /
 * home indicator; results stack just above it so the nearest ones are under the
 * thumb. Adding tasks lives in the FAB composer, not here.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useStore } from "@/store";
import { Icon } from "@/components";
import { useKeyboardInset } from "@/lib/keyboard";
import { usePhoneLayer } from "@/lib/phoneHistory";
import { searchAll, MIN_QUERY, type SearchHit, type SearchKind } from "@/lib/search";
import { useNoteBodyHits } from "@/views/Capture/useNoteBodyHits";

const FIELD_H = 52;
const GAP = 12;

const SECTIONS: ReadonlyArray<{ kind: SearchKind; label: string }> = [
  { kind: "task", label: "Tasks" },
  { kind: "note", label: "Notes" },
  { kind: "goal", label: "Goals" },
  { kind: "notebook", label: "Notebooks" },
];

/** Title with the first case-insensitive match of `q` highlighted. */
function Highlight({ text, q }: { text: string; q: string }): JSX.Element {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-accent-soft px-0.5 font-semibold text-accent-ink">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** The phone search overlay. */
export function SearchOverlay(): JSX.Element | null {
  const open = useStore((s) => s.paletteOpen);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const goals = useStore((s) => s.goals);
  const notebooks = useStore((s) => s.notebooks);
  const closePalette = useStore((s) => s.closePalette);
  const navigate = useStore((s) => s.navigate);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const selectNote = useStore((s) => s.selectNote);
  const inset = useKeyboardInset();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  usePhoneLayer("search", open, closePalette);

  const q = query.trim();
  const bodyHits = useNoteBodyHits(open ? q : "");
  const hits = useMemo(
    () => searchAll(q, { tasks, notes, goals, notebooks }, bodyHits),
    [q, tasks, notes, goals, notebooks, bodyHits],
  );
  const doneById = useMemo(() => new Map(tasks.map((t) => [t.id, t.status] as const)), [tasks]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  if (!open) return null;

  const openHit = (hit: SearchHit): void => {
    closePalette();
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
  };

  const fieldBottom = inset > 0 ? inset + 10 : "max(12px, env(safe-area-inset-bottom))";
  const searching = q.length >= MIN_QUERY;

  return (
    <div
      className="fixed inset-0 z-50 bg-bg"
      onKeyDown={(e) => {
        if (e.key === "Escape") closePalette();
      }}
    >
      <div
        className="absolute inset-x-0 top-0 overflow-y-auto overscroll-contain"
        style={{ bottom: `calc(${typeof fieldBottom === "number" ? `${fieldBottom}px` : fieldBottom} + ${FIELD_H + GAP}px)` }}
      >
        <div className="flex min-h-full flex-col justify-end px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
          {!searching ? (
            <p className="px-1 text-[13px] text-ink-3">Search tasks, notes and goals</p>
          ) : hits.length === 0 ? (
            <p className="px-1 text-[15px] text-ink-3">No matches for “{q}”</p>
          ) : (
            SECTIONS.map(({ kind, label }) => {
              const group = hits.filter((h) => h.kind === kind);
              if (group.length === 0) return null;
              return (
                <section key={kind} className="mt-4 first:mt-0">
                  <h2 className="mb-1.5 px-1 text-[13px] font-semibold text-ink-2">
                    {label} <span className="font-normal text-ink-3">{group.length}</span>
                  </h2>
                  <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
                    {group.map((hit) => {
                      const muted = kind === "task" && doneById.get(hit.id) !== "open" && !!hit.sub;
                      const twoLine = kind === "note" && !!hit.sub;
                      return (
                        <button
                          key={`${hit.kind}-${hit.id}`}
                          type="button"
                          onClick={() => openHit(hit)}
                          className={`flex w-full items-center gap-3 px-4 text-left ${twoLine ? "min-h-14" : "min-h-12"} ${muted ? "opacity-60" : ""}`}
                        >
                          {kind === "task" && (
                            <span
                              aria-hidden="true"
                              className="h-5 w-5 shrink-0 rounded-full border-[1.6px] border-ink-2"
                            />
                          )}
                          <span className="flex min-w-0 flex-col py-1.5">
                            <span className="truncate text-[16px] text-ink">
                              <Highlight text={hit.title} q={q} />
                            </span>
                            {hit.sub && (
                              <span className="truncate text-[13px] text-ink-2">{hit.sub}</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>

      <div
        className="absolute left-3 right-3 flex items-center gap-1"
        style={{ bottom: fieldBottom }}
      >
        <div className="flex h-[52px] min-w-0 flex-1 items-center rounded-[26px] bg-glass pl-4 shadow-glass backdrop-blur-[20px] shadow-[inset_0_0_0_1.5px_var(--accent-line)]">
          <span className="text-ink-2">
            <Icon name="search" size={20} />
          </span>
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoFocus
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") inputRef.current?.blur();
            }}
            placeholder="Search"
            className="h-full min-w-0 flex-1 appearance-none border-none bg-transparent px-3 text-[17px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="grid h-11 w-11 shrink-0 place-items-center text-ink-2"
            >
              <Icon name="x" size={18} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={closePalette}
          className="h-[52px] shrink-0 px-3 text-[17px] font-semibold text-accent-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
