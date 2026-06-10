/**
 * Notes — the two-pane Notes screen (docs/adr/0005).
 *
 * Left: a searchable, scrollable list of note cards (context dot, title,
 * body-derived excerpt, "Nd ago"). Right: a WYSIWYG TipTap editor with an
 * editable serif title (metadata) above the body, a light formatting toolbar,
 * and the note's context + linked goal + "Edited Nd ago". No raw markdown is
 * ever shown — "No markdown — just write".
 *
 * Editing is autosaved (debounce ~800ms, flushed on switch/unmount) — there is
 * no save button. Note creation/deletion live in the list header; deletion is
 * the only removal path and is confirmed.
 */

import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import type { Context, Note, Notebook } from "@/types";
import {
  goalsById,
  selectNotesByNotebook,
  useStore,
  type AppState,
} from "@/store";
import { EmptyState, GoalChip, Icon } from "@/components";
import { NoteList } from "./NoteList";
import { NoteEditor } from "./NoteEditor";
import type { NoteEditorStore } from "./useNoteEditor";

/* ----------------------------------------------------------- store selectors */

const selectNotesList = (s: AppState): Note[] => s.notes;
const selectNotebooksList = (s: AppState): Notebook[] => s.notebooks;
const selectContextFilter = (s: AppState): AppState["contextFilter"] => s.contextFilter;
const selectGoals = (s: AppState): AppState["goals"] => s.goals;

/* --------------------------------------------------------------------- view */

/** The Notes screen entry component. */
export default function Notes(): JSX.Element {
  const notes = useStore(selectNotesList);
  const notebooks = useStore(selectNotebooksList);
  const contextFilter = useStore(selectContextFilter);
  const goals = useStore(selectGoals);

  const addNote = useStore((s) => s.addNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const getNoteBody = useStore((s) => s.getNoteBody);
  const saveNote = useStore((s) => s.saveNote);
  const selectedId = useStore((s) => s.selectedNoteId);
  const selectNote = useStore((s) => s.selectNote);
  const navigate = useStore((s) => s.navigate);
  const addNotebook = useStore((s) => s.addNotebook);
  const renameNotebook = useStore((s) => s.renameNotebook);
  const deleteNotebook = useStore((s) => s.deleteNotebook);
  const moveNoteToNotebook = useStore((s) => s.moveNoteToNotebook);

  const [query, setQuery] = useState("");

  const data = useMemo(
    () => selectNotesByNotebook(notes, notebooks, contextFilter, query),
    [notes, notebooks, contextFilter, query],
  );

  // Whether this context has any notebooks at all (independent of search) — a
  // notebook-less context renders as a plain flat list, like before notebooks.
  const contextHasNotebooks = useMemo(
    () => notebooks.some((n) => contextFilter === "all" || n.context === contextFilter),
    [notebooks, contextFilter],
  );

  // Flat list of currently-visible notes for selection seeding, body prefetch,
  // and delete fallback (the grouped structure is purely presentational).
  const visibleNotes = useMemo(
    () => [...data.groups.flatMap((g) => g.notes), ...data.unfiled],
    [data],
  );

  // Seed the selection to the first visible note, and re-seed when the active
  // filter/search drops the current selection from view.
  useEffect(() => {
    const stillVisible = visibleNotes.some((n) => n.id === selectedId);
    if (!stillVisible) selectNote(visibleNotes[0]?.id ?? null);
  }, [visibleNotes, selectedId, selectNote]);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  );

  // The selected note's notebook, only when it resolves to a same-context
  // notebook (a mismatched/dangling pointer reads as Unfiled — ADR-0008).
  const selectedNotebook = useMemo(
    () =>
      selectedNote && selectedNote.notebookId
        ? notebooks.find(
            (n) => n.id === selectedNote.notebookId && n.context === selectedNote.context,
          ) ?? null
        : null,
    [selectedNote, notebooks],
  );

  const goalIndex = useMemo(() => goalsById(goals), [goals]);

  const noteStore = useMemo<NoteEditorStore>(
    () => ({ getNoteBody, saveNote }),
    [getNoteBody, saveNote],
  );

  /** Cache of body text per note id, populated as cards become visible. */
  const [bodies, setBodies] = useState<Record<string, string>>({});

  /** Keep a card's excerpt in sync when its body is loaded/saved by the editor. */
  const rememberBody = useCallback((id: string, body: string): void => {
    setBodies((prev) => (prev[id] === body ? prev : { ...prev, [id]: body }));
  }, []);

  // Fetch bodies for visible notes once, to render real excerpts in the list.
  useEffect(() => {
    let cancelled = false;
    const missing = visibleNotes.filter((n) => bodies[n.id] === undefined);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (n) => [n.id, await getNoteBody(n.id)] as const),
    ).then((pairs) => {
      if (cancelled) return;
      setBodies((prev) => {
        const next = { ...prev };
        // Never clobber an entry the editor may have refreshed in the meantime.
        for (const [id, body] of pairs) if (next[id] === undefined) next[id] = body;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [visibleNotes, bodies, getNoteBody]);

  /** Create a fresh Unfiled note in the active context and select it. */
  const handleNewNote = async (): Promise<void> => {
    const context: Context = contextFilter === "all" ? "personal" : contextFilter;
    const created = await addNote({ title: "Untitled", context });
    setBodies((prev) => ({ ...prev, [created.id]: "" }));
    selectNote(created.id);
  };

  /** Create a fresh note filed in `notebook` (inheriting its context) and select it. */
  const handleNewNoteInNotebook = async (notebook: Notebook): Promise<void> => {
    const created = await addNote({
      title: "Untitled",
      context: notebook.context,
      notebookId: notebook.id,
    });
    setBodies((prev) => ({ ...prev, [created.id]: "" }));
    selectNote(created.id);
  };

  /** Confirm + delete the selected note, then fall back to a neighbour. */
  const handleDelete = async (note: Note): Promise<void> => {
    const ok = window.confirm(`Delete "${note.title || "Untitled"}"? This cannot be undone.`);
    if (!ok) return;
    const fallback = visibleNotes.find((n) => n.id !== note.id)?.id ?? null;
    await deleteNote(note.id);
    selectNote(fallback);
  };

  /** Confirm + delete a notebook; its notes survive as Unfiled (ADR-0008). */
  const handleDeleteNotebook = async (notebook: Notebook): Promise<void> => {
    const count = data.groups.find((g) => g.notebook.id === notebook.id)?.notes.length ?? 0;
    const tail = count
      ? ` Its ${count} note${count === 1 ? "" : "s"} will be moved to Unfiled.`
      : "";
    if (!window.confirm(`Delete notebook "${notebook.name}"?${tail}`)) return;
    await deleteNotebook(notebook.id);
  };

  const openGoal = (goalId: string): void => navigate("goal", goalId);

  return (
    <div className="flex h-full">
      <NoteList
        data={data}
        contextFilter={contextFilter}
        contextHasNotebooks={contextHasNotebooks}
        selectedId={selectedId}
        query={query}
        bodies={bodies}
        onQueryChange={setQuery}
        onSelect={selectNote}
        onNewNote={handleNewNote}
        onNewNoteInNotebook={handleNewNoteInNotebook}
        onCreateNotebook={(name, context) => void addNotebook({ name, context })}
        onRenameNotebook={(id, name) => void renameNotebook(id, name)}
        onDeleteNotebook={handleDeleteNotebook}
        onMoveNote={(id, notebookId) => void moveNoteToNotebook(id, notebookId)}
      />
      <NoteEditorPane
        note={selectedNote}
        notebook={selectedNotebook}
        goal={selectedNote?.goalId ? goalIndex[selectedNote.goalId] ?? null : null}
        store={noteStore}
        onBody={rememberBody}
        onOpenGoal={openGoal}
        onDelete={handleDelete}
      />
    </div>
  );
}

/* --------------------------------------------------------------- right pane */

interface NoteEditorPaneProps {
  note: Note | null;
  notebook: Notebook | null;
  goal: Parameters<typeof GoalChip>[0]["goal"];
  store: NoteEditorStore;
  onBody: (id: string, markdown: string) => void;
  onOpenGoal: (goalId: string) => void;
  onDelete: (note: Note) => void;
}

/** The editor pane: the shared NoteEditor wrapped with the Notes-screen chrome
 *  (a switchable context + notebook/goal chips), or an empty state. */
function NoteEditorPane({
  note,
  notebook,
  goal,
  store,
  onBody,
  onOpenGoal,
  onDelete,
}: NoteEditorPaneProps): JSX.Element {
  if (!note) {
    return (
      <div className="grid flex-1 place-items-center">
        <EmptyState
          title="Nothing selected"
          hint="Pick a note on the left, or start a new one."
        />
      </div>
    );
  }

  const metaExtra = (
    <>
      {notebook && (
        <>
          <span className="text-ink-3">·</span>
          <span className="inline-flex items-center gap-1 text-ink-2" title={`In ${notebook.name}`}>
            <Icon name="notebook" size={13} />
            {notebook.name}
          </span>
        </>
      )}
      {goal && (
        <>
          <span className="text-ink-3">·</span>
          <GoalChip goal={goal} onOpen={onOpenGoal} />
        </>
      )}
    </>
  );

  return (
    <NoteEditor
      note={note}
      store={store}
      onBody={onBody}
      onDelete={() => onDelete(note)}
      metaExtra={metaExtra}
    />
  );
}
