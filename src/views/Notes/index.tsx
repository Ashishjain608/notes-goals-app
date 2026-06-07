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
import { EditorContent, type Editor } from "@tiptap/react";
import type { Context, Note } from "@/types";
import { ageInDays } from "@/lib/dates";
import {
  goalsById,
  selectNotes,
  useStore,
  type AppState,
} from "@/store";
import { ContextDot, EmptyState, GoalChip, Icon } from "@/components";
import { excerptFromMarkdown, EXCERPT_PLACEHOLDER } from "./excerpt";
import { useNoteEditor, type NoteEditorStore } from "./useNoteEditor";

/* ----------------------------------------------------------- store selectors */

const selectNotesList = (s: AppState): Note[] => s.notes;
const selectContextFilter = (s: AppState): AppState["contextFilter"] => s.contextFilter;
const selectGoals = (s: AppState): AppState["goals"] => s.goals;

/* --------------------------------------------------------------------- view */

/** The Notes screen entry component. */
export default function Notes(): JSX.Element {
  const notes = useStore(selectNotesList);
  const contextFilter = useStore(selectContextFilter);
  const goals = useStore(selectGoals);

  const addNote = useStore((s) => s.addNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const getNoteBody = useStore((s) => s.getNoteBody);
  const saveNote = useStore((s) => s.saveNote);
  const selectedId = useStore((s) => s.selectedNoteId);
  const selectNote = useStore((s) => s.selectNote);
  const navigate = useStore((s) => s.navigate);

  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => selectNotes(notes, contextFilter, query),
    [notes, contextFilter, query],
  );

  // Seed the selection to the first visible note, and re-seed when the active
  // filter/search drops the current selection from view.
  useEffect(() => {
    const stillVisible = visible.some((n) => n.id === selectedId);
    if (!stillVisible) selectNote(visible[0]?.id ?? null);
  }, [visible, selectedId, selectNote]);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
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
    const missing = visible.filter((n) => bodies[n.id] === undefined);
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
  }, [visible, bodies, getNoteBody]);

  /** Create a fresh note in the active context and select it. */
  const handleNewNote = async (): Promise<void> => {
    const context: Context = contextFilter === "all" ? "personal" : contextFilter;
    const created = await addNote({ title: "Untitled", context });
    setBodies((prev) => ({ ...prev, [created.id]: "" }));
    selectNote(created.id);
  };

  /** Confirm + delete the selected note, then fall back to a neighbour. */
  const handleDelete = async (note: Note): Promise<void> => {
    const ok = window.confirm(`Delete "${note.title || "Untitled"}"? This cannot be undone.`);
    if (!ok) return;
    const fallback = visible.find((n) => n.id !== note.id)?.id ?? null;
    await deleteNote(note.id);
    selectNote(fallback);
  };

  const openGoal = (goalId: string): void => navigate("goal", goalId);

  return (
    <div className="flex h-full">
      <NoteList
        notes={visible}
        selectedId={selectedId}
        query={query}
        bodies={bodies}
        onQueryChange={setQuery}
        onSelect={selectNote}
        onNewNote={handleNewNote}
      />
      <NoteEditorPane
        note={selectedNote}
        goal={selectedNote?.goalId ? goalIndex[selectedNote.goalId] ?? null : null}
        store={noteStore}
        onBody={rememberBody}
        onOpenGoal={openGoal}
        onDelete={handleDelete}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- left pane */

interface NoteListProps {
  notes: Note[];
  selectedId: string | null;
  query: string;
  bodies: Record<string, string>;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
  onNewNote: () => void;
}

/** Searchable, scrollable list of note cards (left pane). */
function NoteList({
  notes,
  selectedId,
  query,
  bodies,
  onQueryChange,
  onSelect,
  onNewNote,
}: NoteListProps): JSX.Element {
  return (
    <div className="scroll w-80 flex-shrink-0 border-r border-line py-7 pb-16">
      <div className="mb-4 px-[22px]">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-ink">
            Notes
          </div>
          <button
            type="button"
            onClick={onNewNote}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 transition-colors duration-150 hover:bg-raise hover:text-ink"
          >
            <Icon name="plus" size={14} />
            New note
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-surface-2 px-[11px] py-2">
          <Icon name="search" size={16} className="text-ink-3" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search notes"
            className="flex-1 border-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </div>
      </div>

      <div className="px-3">
        {notes.length === 0 ? (
          <div className="px-3 py-6 text-sm italic text-ink-3">
            {query ? "No notes match your search." : "No notes in this context yet."}
          </div>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              active={note.id === selectedId}
              body={bodies[note.id]}
              onClick={() => onSelect(note.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface NoteCardProps {
  note: Note;
  active: boolean;
  body: string | undefined;
  onClick: () => void;
}

/** A single note card: context dot + title, excerpt, and relative edit age. */
function NoteCard({ note, active, body, onClick }: NoteCardProps): JSX.Element {
  const excerpt = body === undefined ? EXCERPT_PLACEHOLDER : excerptFromMarkdown(body);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-0.5 block w-full rounded-lg px-3 py-3 text-left transition-colors duration-150 ${
        active ? "bg-raise" : "hover:bg-surface-2"
      }`}
    >
      <div className="mb-1 flex items-center gap-[7px]">
        <ContextDot context={note.context} size={6} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.01em] text-ink">
          {note.title || "Untitled"}
        </span>
      </div>
      <div className="line-clamp-2 font-serif text-[13.5px] leading-snug text-ink-2">
        {excerpt}
      </div>
      <div className="mt-1.5 text-[11.5px] text-ink-3">{ageInDays(note.updated)}d ago</div>
    </button>
  );
}

/* --------------------------------------------------------------- right pane */

interface NoteEditorPaneProps {
  note: Note | null;
  goal: Parameters<typeof GoalChip>[0]["goal"];
  store: NoteEditorStore;
  onBody: (id: string, markdown: string) => void;
  onOpenGoal: (goalId: string) => void;
  onDelete: (note: Note) => void;
}

/** The editor pane: title, toolbar, body, metadata, and delete affordance. */
function NoteEditorPane({
  note,
  goal,
  store,
  onBody,
  onOpenGoal,
  onDelete,
}: NoteEditorPaneProps): JSX.Element {
  const { editor, title, setTitle, loadingBody } = useNoteEditor(note, store, {
    onBody,
  });

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
    <div className="scroll flex-1 pb-20">
      <div className="mx-auto max-w-[660px] px-10">
        <Toolbar editor={editor} onDelete={() => onDelete(note)} />

        <div className="pt-3.5">
          <div className="mb-3.5 flex items-center gap-2.5 text-[12.5px] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <ContextDot context={note.context} size={7} />
              {note.context}
            </span>
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

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            aria-label="Note title"
            className="mb-[18px] w-full border-none bg-transparent font-serif text-[36px] font-medium leading-[1.1] tracking-[-0.015em] text-ink outline-none placeholder:text-ink-3"
          />

          {loadingBody ? (
            <div className="font-serif text-[18px] italic text-ink-3">Loading…</div>
          ) : (
            <EditorContent editor={editor} className="note-prose" />
          )}
        </div>
      </div>

      <EditorStyles />
    </div>
  );
}

/* ------------------------------------------------------------------ toolbar */

interface ToolbarProps {
  editor: Editor | null;
  onDelete: () => void;
}

/** Light WYSIWYG toolbar wired to TipTap commands (matches the prototype). */
function Toolbar({ editor, onDelete }: ToolbarProps): JSX.Element {
  const promptLink = (): void => {
    if (!editor) return;
    const previous = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("Link URL", previous);
    if (url === null) return; // cancelled
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url.trim() === "") chain.unsetLink().run();
    else chain.setLink({ href: url.trim() }).run();
  };

  const disabled = !editor;

  return (
    <div className="sticky top-0 z-10 flex items-center gap-0.5 bg-bg pb-3 pt-4">
      <ToolbarButton
        label="Bold"
        active={editor?.isActive("bold") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor?.isActive("italic") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <span className="font-serif italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label="Heading"
        active={editor?.isActive("heading", { level: 2 }) ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <span className="text-[13.5px] font-semibold">H</span>
      </ToolbarButton>
      <ToolbarButton
        label="Checklist"
        active={editor?.isActive("taskList") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      >
        <Icon name="check" size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Link"
        active={editor?.isActive("link") ?? false}
        disabled={disabled}
        onClick={promptLink}
      >
        <Icon name="link" size={15} />
      </ToolbarButton>

      <span className="ml-auto flex items-center gap-3">
        <span className="text-[11.5px] italic text-ink-3">No markdown — just write</span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete note"
          title="Delete note"
          className="grid h-[30px] w-8 place-items-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-warn-soft hover:text-warn-ink"
        >
          <Icon name="trash" size={15} />
        </button>
      </span>
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: JSX.Element;
}

/** One toolbar control; reflects active mark/node state. */
function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: ToolbarButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-[30px] w-8 place-items-center rounded-md text-[14px] transition-colors duration-150 disabled:opacity-40 ${
        active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-raise"
      }`}
    >
      {children}
    </button>
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
.note-prose .ProseMirror {
  font-family: var(--serif);
  font-size: 18px;
  line-height: 1.62;
  color: var(--ink);
  letter-spacing: .002em;
  outline: none;
  min-height: 320px;
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
.note-prose .ProseMirror ol { padding-left: 1.4em; }
.note-prose .ProseMirror li { margin: 4px 0; }
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
`;
