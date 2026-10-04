/**
 * PhoneNotes — the phone Notes list (ADR-0012): a notebook shelf (tap a card to
 * filter, tap again to clear) above the "Pinned" and "Recent" note cards. New notes come from
 * the FAB composer. Opening a note shows the shared editor (see ./index.tsx).
 */
import { useMemo, useState, type JSX } from "react";
import { goalsById, selectNotesByNotebook, useStore } from "@/store";
import { EmptyState } from "@/components";
import { NoteCard } from "@/components/NoteCard";
import { NotebookShelf, UNFILED_KEY, type ShelfItem } from "@/components/NotebookShelf";
import { PhoneHeader } from "@/shell/phone/PhoneHeader";
import { ageInDays } from "@/lib/dates";
import { excerptFromMarkdown } from "./excerpt";

/** "Today", "1d", "12d". */
export function ageLabel(days: number): string {
  return days <= 0 ? "Today" : `${days}d`;
}

export function PhoneNotes({ bodies }: { bodies: Record<string, string> }): JSX.Element {
  const notes = useStore((s) => s.notes);
  const notebooks = useStore((s) => s.notebooks);
  const goals = useStore((s) => s.goals);
  const contextFilter = useStore((s) => s.contextFilter);
  const selectNote = useStore((s) => s.selectNote);
  const [picked, setPicked] = useState<string | null>(null);

  const data = useMemo(
    () => selectNotesByNotebook(notes, notebooks, contextFilter, ""),
    [notes, notebooks, contextFilter],
  );
  const goalIndex = useMemo(() => goalsById(goals), [goals]);

  const items = useMemo<ShelfItem[]>(() => {
    const books = data.groups.map((g) => ({ key: g.notebook.id, name: g.notebook.name, count: g.notes.length }));
    return data.unfiled.length > 0 ? [...books, { key: UNFILED_KEY, name: "Unfiled", count: data.unfiled.length }] : books;
  }, [data]);

  // A filter whose notebook vanished (deleted, context switched) quietly clears.
  const active = items.some((i) => i.key === picked) ? picked : null;
  const total = data.groups.reduce((n, g) => n + g.notes.length, 0) + data.unfiled.length;

  const recent = useMemo(() => {
    if (active === UNFILED_KEY) return data.unfiled;
    if (active) return data.groups.find((g) => g.notebook.id === active)?.notes ?? [];
    // Most recently edited first across every group.
    return [...data.groups.flatMap((g) => g.notes), ...data.unfiled].sort((a, b) =>
      a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0,
    );
  }, [data, active]);

  const notebookName = useMemo(() => {
    const byNote = new Map<string, string>();
    for (const g of data.groups) for (const n of g.notes) byNote.set(n.id, g.notebook.name);
    return byNote;
  }, [data]);

  return (
    <div className="scroll h-full overflow-y-auto px-4 pt-3">
      <PhoneHeader title="Notes" subline={`${total} ${total === 1 ? "note" : "notes"}`} />
      {items.length > 0 && (
        <div className="mt-4">
          <NotebookShelf items={items} selected={active} onSelect={(key) => setPicked(key === active ? null : key)} />
        </div>
      )}
      {total === 0 ? (
        <div className="pt-10">
          <EmptyState title="No notes yet" hint="Tap + to write one." />
        </div>
      ) : (
        <>
          {(
            [
              ["Pinned", recent.filter((n) => n.pinned)],
              ["Recent", recent.filter((n) => !n.pinned)],
            ] as const
          ).map(([label, list]) =>
            list.length === 0 ? null : (
              <section key={label}>
                <h2 className="mb-2 mt-5 pl-1 text-[13px] font-semibold uppercase tracking-[.06em] text-ink-2">{label}</h2>
                <div className="flex flex-col gap-2">
                  {list.map((n) => (
                    <NoteCard
                      key={n.id}
                      title={n.title}
                      preview={excerptFromMarkdown(bodies[n.id] ?? "")}
                      context={n.context}
                      notebook={notebookName.get(n.id)}
                      goal={n.goalId ? goalIndex[n.goalId]?.title : null}
                      age={ageLabel(ageInDays(n.updated))}
                      onClick={() => selectNote(n.id)}
                    />
                  ))}
                </div>
              </section>
            ),
          )}
        </>
      )}
    </div>
  );
}
