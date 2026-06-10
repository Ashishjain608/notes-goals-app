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
import { EditorContent } from "@tiptap/react";
import type { Context, Note, Notebook } from "@/types";
import { ageInDays } from "@/lib/dates";
import {
  goalsById,
  selectNotesByNotebook,
  useStore,
  type AppState,
} from "@/store";
import { ContextDot, EmptyState, GoalChip, Icon } from "@/components";
import { NoteList } from "./NoteList";
import { EditorToolbar } from "./EditorToolbar";
import { useNoteEditor, type NoteEditorStore } from "./useNoteEditor";

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

const NOTE_CONTEXTS: ReadonlyArray<{ value: Context; label: string }> = [
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
];

/** A compact Office / Personal toggle for switching a note's context inline. */
function ContextSwitcher({
  value,
  onChange,
}: {
  value: Context;
  onChange: (context: Context) => void;
}): JSX.Element {
  return (
    <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
      {NOTE_CONTEXTS.map((c) => {
        const active = value === c.value;
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            className={`flex items-center gap-1.5 rounded-[5px] px-2 py-[3px] text-[12px] font-medium transition-colors duration-150 ${
              active ? "bg-surface text-ink shadow-sm" : "bg-transparent text-ink-3 hover:text-ink-2"
            }`}
          >
            <ContextDot context={c.value} size={6} /> {c.label}
          </button>
        );
      })}
    </div>
  );
}

/** The editor pane: title, toolbar, body, metadata, and delete affordance. */
function NoteEditorPane({
  note,
  notebook,
  goal,
  store,
  onBody,
  onOpenGoal,
  onDelete,
}: NoteEditorPaneProps): JSX.Element {
  const { editor, title, setTitle, context, setContext, loadingBody } = useNoteEditor(
    note,
    store,
    { onBody },
  );

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

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="mx-auto flex h-full w-full max-w-[1000px] flex-col px-8">
        <EditorToolbar editor={editor} onDelete={() => onDelete(note)} />

        <div className="mb-3 mt-1 flex items-center gap-2.5 text-[12.5px] text-ink-2">
          <ContextSwitcher value={context} onChange={setContext} />
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
          <span className="ml-auto text-xs text-ink-3">
            Edited {ageInDays(note.updated)}d ago
          </span>
        </div>

        {/* Title and body share one bordered frame — a border only, same background
            as the page — split by a hairline so the two regions read as distinct.
            The frame fills the pane; Enter in the title drops into the body. */}
        <div className="mb-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                editor?.commands.focus("start");
              }
            }}
            placeholder="Untitled"
            aria-label="Note title"
            className="w-full border-none bg-transparent px-7 pb-4 pt-5 font-serif text-[30px] font-medium leading-[1.15] tracking-[-0.015em] text-ink outline-none placeholder:text-ink-3"
          />
          <div className="h-px bg-line" />
          {loadingBody ? (
            <div className="px-7 py-5 font-serif text-[18px] italic text-ink-3">Loading…</div>
          ) : (
            <div
              className="scroll min-h-0 flex-1 cursor-text"
              onClick={() => editor?.commands.focus()}
            >
              <EditorContent editor={editor} className="note-prose px-7 py-6" />
            </div>
          )}
        </div>
      </div>

      <EditorStyles />
    </div>
  );
}

/* ------------------------------------------------------------- editor styles
   Scoped ProseMirror styling for the serif WYSIWYG body. Lives here (the only
   editable folder) rather than the global stylesheet, keyed off `.note-prose`. */

/** Inject the scoped editor stylesheet once. */
function EditorStyles(): JSX.Element {
  return <style>{NOTE_PROSE_CSS}</style>;
}

const NOTE_PROSE_CSS = `
.note-prose {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.note-prose .ProseMirror {
  flex: 1;
  font-family: var(--serif);
  font-size: 18px;
  line-height: 1.62;
  color: var(--ink);
  letter-spacing: .002em;
  outline: none;
  min-height: 240px;
}
.note-prose .ProseMirror > * + * { margin-top: 14px; }
.note-prose .ProseMirror p { margin: 0; }
.note-prose .ProseMirror h1,
.note-prose .ProseMirror h2,
.note-prose .ProseMirror h3 {
  font-family: var(--sans);
  font-weight: 600;
  letter-spacing: .01em;
  color: var(--ink);
  margin: 26px 0 10px;
}
.note-prose .ProseMirror h1 { font-size: 22px; }
.note-prose .ProseMirror h2 { font-size: 18px; }
.note-prose .ProseMirror h3 {
  font-size: 14px;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--ink-2);
}
.note-prose .ProseMirror ul,
.note-prose .ProseMirror ol { padding-left: 1.5em; }
/* Tailwind's preflight resets list-style to none; restore real markers here.
   The taskList rule below is more specific, so checklists stay marker-less. */
.note-prose .ProseMirror ul { list-style: disc; }
.note-prose .ProseMirror ol { list-style: decimal; }
.note-prose .ProseMirror ul ul { list-style: circle; }
.note-prose .ProseMirror ul ul ul { list-style: square; }
.note-prose .ProseMirror li { margin: 4px 0; }
.note-prose .ProseMirror li > p { margin: 0; }
.note-prose .ProseMirror ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}
.note-prose .ProseMirror ul[data-type="taskList"] li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.note-prose .ProseMirror ul[data-type="taskList"] li > label {
  margin-top: 4px;
  user-select: none;
}
.note-prose .ProseMirror ul[data-type="taskList"] li > div { flex: 1; }
.note-prose .ProseMirror blockquote {
  border-left: 3px solid var(--accent-line);
  padding-left: 14px;
  color: var(--ink-2);
}
.note-prose .ProseMirror code {
  font-family: var(--mono);
  font-size: .86em;
  background: var(--surface-2);
  border-radius: 5px;
  padding: 1px 5px;
}
.note-prose .ProseMirror pre {
  font-family: var(--mono);
  font-size: 13.5px;
  background: var(--surface-2);
  border-radius: 9px;
  padding: 12px 14px;
  overflow-x: auto;
}
.note-prose .ProseMirror pre code { background: none; padding: 0; }
.note-prose .ProseMirror a {
  color: var(--accent-ink);
  text-decoration: underline;
  text-decoration-color: var(--accent-line);
  cursor: pointer;
}
.note-prose .ProseMirror hr {
  border: none;
  border-top: 1px solid var(--line);
  margin: 22px 0;
}
/* Placeholder text in an empty body (TipTap Placeholder extension). */
.note-prose .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--ink-3);
  float: left;
  height: 0;
  pointer-events: none;
}
`;
