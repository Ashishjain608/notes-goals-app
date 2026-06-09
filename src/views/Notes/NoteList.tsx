/**
 * NoteList — the left pane of the Notes screen (docs/adr/0008).
 *
 * Renders notes grouped into collapsible Notebook sections plus an Unfiled
 * group, with drag-and-drop filing: drag a note card onto a notebook to file it
 * (only same-Context drops are accepted), or onto Unfiled to take it out. New
 * notebooks are created inline; a notebook can be renamed (double-click its
 * name) or deleted (its notes survive as Unfiled). While a search query is
 * active the grouping collapses to a flat result list. With no notebooks yet,
 * the pane is a plain flat list — identical to the pre-notebook behavior.
 */

import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import type { Context, ContextFilter, Note, Notebook } from "@/types";
import type { NotesByNotebook, NotebookGroup } from "@/store";
import { ageInDays } from "@/lib/dates";
import { ContextDot, Icon } from "@/components";
import { excerptFromMarkdown, EXCERPT_PLACEHOLDER } from "./excerpt";

/** Sentinel collapse key for the Unfiled group (notebook ids never collide). */
const UNFILED_KEY = "__unfiled__";

export interface NoteListProps {
  data: NotesByNotebook;
  contextFilter: ContextFilter;
  /** Whether this context has any notebooks (drives the flat fallback layout). */
  contextHasNotebooks: boolean;
  selectedId: string | null;
  query: string;
  bodies: Record<string, string>;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
  /** Create an Unfiled note in the active context. */
  onNewNote: () => void;
  /** Create a note inside a notebook (inherits the notebook's context). */
  onNewNoteInNotebook: (notebook: Notebook) => void;
  onCreateNotebook: (name: string, context: Context) => void;
  onRenameNotebook: (id: string, name: string) => void;
  onDeleteNotebook: (notebook: Notebook) => void;
  /** File a note into a notebook, or null to unfile. */
  onMoveNote: (id: string, notebookId: string | null) => void;
}

/** The searchable, grouped note list (left pane). */
export function NoteList({
  data,
  contextFilter,
  contextHasNotebooks,
  selectedId,
  query,
  bodies,
  onQueryChange,
  onSelect,
  onNewNote,
  onNewNoteInNotebook,
  onCreateNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onMoveNote,
}: NoteListProps): JSX.Element {
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState<Note | null>(null);

  const { searching } = data;
  const nothingToShow = data.groups.length === 0 && data.unfiled.length === 0;

  const toggle = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const card = (note: Note): JSX.Element => (
    <NoteCard
      key={note.id}
      note={note}
      active={note.id === selectedId}
      body={bodies[note.id]}
      onClick={() => onSelect(note.id)}
      onDragStart={setDragging}
      onDragEnd={() => setDragging(null)}
    />
  );

  return (
    <div className="scroll w-80 flex-shrink-0 border-r border-line py-7 pb-16">
      <div className="mb-4 px-[22px]">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-ink">
            Notes
          </div>
          <div className="flex items-center gap-0.5">
            <HeaderButton label="New notebook" onClick={() => setCreating(true)}>
              <Icon name="notebook" size={15} />
            </HeaderButton>
            <HeaderButton label="New note" onClick={onNewNote}>
              <Icon name="plus" size={15} />
            </HeaderButton>
          </div>
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

        {creating && (
          <NewNotebookForm
            contextFilter={contextFilter}
            onCreate={(name, context) => {
              onCreateNotebook(name, context);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        )}
      </div>

      <div className="px-3">
        {nothingToShow ? (
          <ListMessage>
            {searching
              ? "No notes or notebooks match your search."
              : "No notes in this context yet."}
          </ListMessage>
        ) : !contextHasNotebooks ? (
          // No notebooks in this context — plain flat list (search filters it).
          data.unfiled.map(card)
        ) : (
          <>
            {data.groups.map((group) => (
              <NotebookRow
                key={group.notebook.id}
                group={group}
                collapsed={searching ? false : collapsed.has(group.notebook.id)}
                dragging={dragging}
                onToggle={() => toggle(group.notebook.id)}
                onAddNote={onNewNoteInNotebook}
                onRename={onRenameNotebook}
                onDelete={onDeleteNotebook}
                onMoveNote={onMoveNote}
                renderCard={card}
              />
            ))}
            {(searching ? data.unfiled.length > 0 : true) && (
              <UnfiledRow
                notes={data.unfiled}
                collapsed={searching ? false : collapsed.has(UNFILED_KEY)}
                dragging={dragging}
                onToggle={() => toggle(UNFILED_KEY)}
                onMoveNote={onMoveNote}
                renderCard={card}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- notebook row */

interface NotebookRowProps {
  group: NotebookGroup;
  collapsed: boolean;
  dragging: Note | null;
  onToggle: () => void;
  onAddNote: (notebook: Notebook) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (notebook: Notebook) => void;
  onMoveNote: (id: string, notebookId: string | null) => void;
  renderCard: (note: Note) => JSX.Element;
}

/** A collapsible notebook section: header (drop target) + its note cards. */
function NotebookRow({
  group,
  collapsed,
  dragging,
  onToggle,
  onAddNote,
  onRename,
  onDelete,
  onMoveNote,
  renderCard,
}: NotebookRowProps): JSX.Element {
  const { notebook, notes } = group;
  const [editing, setEditing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // A notebook only accepts notes of its own context (ADR-0008).
  const canAccept = dragging !== null && dragging.context === notebook.context;

  return (
    <div
      className="mb-0.5"
      onDragOver={(e) => {
        if (canAccept) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        // Only clear when the pointer leaves the whole section, not when it
        // moves between child elements (which would otherwise flicker).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(e) => {
        if (canAccept && dragging) {
          e.preventDefault();
          onMoveNote(dragging.id, notebook.id);
        }
        setDragOver(false);
      }}
    >
      <div
        className={`group/nb flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors duration-150 ${
          dragOver && canAccept ? "bg-accent-soft ring-1 ring-accent-line" : "hover:bg-surface-2"
        }`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand notebook" : "Collapse notebook"}
          className="grid h-5 w-4 place-items-center text-ink-3 hover:text-ink-2"
        >
          <Icon name={collapsed ? "chevron" : "chevronDown"} size={14} />
        </button>
        <ContextDot context={notebook.context} size={6} />

        {editing ? (
          <RenameInput
            initial={notebook.name}
            onCommit={(name) => {
              if (name && name !== notebook.name) onRename(notebook.id, name);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            onDoubleClick={() => setEditing(true)}
            title={notebook.name}
            className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold tracking-[-0.01em] text-ink"
          >
            {notebook.name}
          </button>
        )}

        <span className="tabular-nums text-[11.5px] text-ink-3">{notes.length}</span>
        <span className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/nb:opacity-100">
          <RowAction label="New note in notebook" onClick={() => onAddNote(notebook)}>
            <Icon name="plus" size={13} />
          </RowAction>
          <RowAction label="Delete notebook" warn onClick={() => onDelete(notebook)}>
            <Icon name="trash" size={13} />
          </RowAction>
        </span>
      </div>

      {!collapsed && (
        <div className="ml-[15px] border-l border-line pl-1">
          {notes.length === 0 ? (
            <div className="px-3 py-2 text-[12px] italic text-ink-3">Empty notebook</div>
          ) : (
            notes.map(renderCard)
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- unfiled row */

interface UnfiledRowProps {
  notes: Note[];
  collapsed: boolean;
  dragging: Note | null;
  onToggle: () => void;
  onMoveNote: (id: string, notebookId: string | null) => void;
  renderCard: (note: Note) => JSX.Element;
}

/** The Unfiled group: notes in no notebook. Accepts a drop from any context. */
function UnfiledRow({
  notes,
  collapsed,
  dragging,
  onToggle,
  onMoveNote,
  renderCard,
}: UnfiledRowProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  const canAccept = dragging !== null;

  return (
    <div
      className="mb-0.5"
      onDragOver={(e) => {
        if (canAccept) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(e) => {
        if (canAccept && dragging) {
          e.preventDefault();
          onMoveNote(dragging.id, null);
        }
        setDragOver(false);
      }}
    >
      <div
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors duration-150 ${
          dragOver && canAccept ? "bg-accent-soft ring-1 ring-accent-line" : "hover:bg-surface-2"
        }`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand Unfiled" : "Collapse Unfiled"}
          className="grid h-5 w-4 place-items-center text-ink-3 hover:text-ink-2"
        >
          <Icon name={collapsed ? "chevron" : "chevronDown"} size={14} />
        </button>
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-ink-2">
          Unfiled
        </span>
        <span className="tabular-nums text-[11.5px] text-ink-3">{notes.length}</span>
      </div>

      {!collapsed && notes.length > 0 && (
        <div className="ml-[15px] border-l border-line pl-1">{notes.map(renderCard)}</div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- note card */

interface NoteCardProps {
  note: Note;
  active: boolean;
  body: string | undefined;
  onClick: () => void;
  onDragStart: (note: Note) => void;
  onDragEnd: () => void;
}

/** A draggable note card: context dot + title, excerpt, and relative edit age. */
function NoteCard({ note, active, body, onClick, onDragStart, onDragEnd }: NoteCardProps): JSX.Element {
  const excerpt = body === undefined ? EXCERPT_PLACEHOLDER : excerptFromMarkdown(body);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", note.id);
        onDragStart(note);
      }}
      onDragEnd={onDragEnd}
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
      <div className="line-clamp-2 font-serif text-[13.5px] leading-snug text-ink-2">{excerpt}</div>
      <div className="mt-1.5 text-[11.5px] text-ink-3">{ageInDays(note.updated)}d ago</div>
    </button>
  );
}

/* ------------------------------------------------------------ new notebook form */

const NB_CONTEXTS: ReadonlyArray<{ value: Context; label: string }> = [
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
];

interface NewNotebookFormProps {
  contextFilter: ContextFilter;
  onCreate: (name: string, context: Context) => void;
  onCancel: () => void;
}

/** Inline create form; context is seeded from the active filter (chosen when "all"). */
function NewNotebookForm({ contextFilter, onCreate, onCancel }: NewNotebookFormProps): JSX.Element {
  const [name, setName] = useState("");
  const [context, setContext] = useState<Context>(
    contextFilter === "personal" ? "personal" : "office",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = name.trim();
  const submit = (): void => {
    if (trimmed) onCreate(trimmed, context);
  };

  return (
    <div className="mt-2 rounded-md border border-line bg-surface-2 p-2">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Notebook name…"
        className="w-full border-none bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
      />
      {contextFilter === "all" && (
        <div className="mt-2 flex gap-0.5 rounded-md bg-surface p-0.5">
          {NB_CONTEXTS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setContext(c.value)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 py-[3px] text-[12px] font-medium transition-colors duration-150 ${
                context === c.value ? "bg-surface-2 text-ink shadow-sm" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              <ContextDot context={c.value} size={6} /> {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:bg-raise"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!trimmed}
          className="rounded bg-accent px-2.5 py-1 text-[12px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-px disabled:opacity-40 disabled:hover:translate-y-0"
        >
          Create
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- rename input */

interface RenameInputProps {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/** Inline notebook rename: commits on Enter/blur, cancels on Escape. */
function RenameInput({ initial, onCommit, onCancel }: RenameInputProps): JSX.Element {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(value.trim())}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit(value.trim());
        if (e.key === "Escape") onCancel();
      }}
      className="min-w-0 flex-1 rounded border border-accent-line bg-surface px-1.5 py-0.5 text-[13px] font-semibold text-ink outline-none"
    />
  );
}

/* ------------------------------------------------------------------- small bits */

/** A compact header icon button (New note / New notebook). */
function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-md text-ink-2 transition-colors duration-150 hover:bg-raise hover:text-ink"
    >
      {children}
    </button>
  );
}

/** A hover-revealed action on a notebook row. */
function RowAction({
  label,
  warn = false,
  onClick,
  children,
}: {
  label: string;
  warn?: boolean;
  onClick: () => void;
  children: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`grid h-6 w-6 place-items-center rounded transition-colors duration-150 ${
        warn ? "text-ink-3 hover:bg-warn-soft hover:text-warn-ink" : "text-ink-3 hover:bg-raise hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** An italic placeholder line for empty/filtered states. */
function ListMessage({ children }: { children: ReactNode }): JSX.Element {
  return <div className="px-3 py-6 text-sm italic text-ink-3">{children}</div>;
}
