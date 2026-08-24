/**
 * NoteEditor — the shared note editing surface (docs/adr/0005).
 *
 * A formatting toolbar + an editable serif title + the WYSIWYG TipTap body +
 * an attachment strip, driven by useNoteEditor (debounced autosave). Used by
 * the Notes screen and by the goal note drawer. The host supplies surrounding
 * chrome via `metaExtra` (chips) and chooses whether the context is
 * switchable here or fixed (a read-only chip). An optional `apiRef` exposes
 * flush/isEmpty so a host can persist pending edits and discard an empty
 * draft on close.
 */
import { useEffect, type JSX, type MutableRefObject, type ReactNode } from "react";
import { EditorContent } from "@tiptap/react";
import type { Attachment, Context, Note } from "@/types";
import { ageInDays } from "@/lib/dates";
import { openAttachment } from "@/lib/ipc";
import { AttachmentList, ContextDot } from "@/components";
import { EditorToolbar } from "./EditorToolbar";
import { useNoteEditor, type NoteEditorStore } from "./useNoteEditor";

/** Coerce a thrown value into a short user-facing message (mirrors the store's own convention). */
function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}

const NOTE_CONTEXTS: ReadonlyArray<{ value: Context; label: string }> = [
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
];

/** Imperative handle a host can use to persist/inspect the editor before closing. */
export interface NoteEditorApi {
  flush: () => void;
  discard: () => void;
  getBody: () => string;
  isEmpty: () => boolean;
}

export interface NoteEditorProps {
  note: Note;
  store: NoteEditorStore;
  onBody?: (id: string, markdown: string) => void;
  onDelete?: () => void;
  /** True (default): inline Office/Personal switcher. False: a read-only chip. */
  contextEditable?: boolean;
  /** Extra chips rendered in the meta row (e.g. notebook / goal). */
  metaExtra?: ReactNode;
  /** Receives a flush/isEmpty handle for close-time persistence + empty checks. */
  apiRef?: MutableRefObject<NoteEditorApi | null>;
}

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

/** The shared editing surface for one note. */
export function NoteEditor({
  note,
  store,
  onBody,
  onDelete,
  contextEditable = true,
  metaExtra,
  apiRef,
}: NoteEditorProps): JSX.Element {
  const {
    editor,
    title,
    setTitle,
    context,
    setContext,
    loadingBody,
    flush,
    discard,
    getBody,
    isEmpty,
    attachments,
    addAttachments,
    removeAttachment,
  } = useNoteEditor(note, store, { onBody });

  // Expose the editor handle so a host can persist / discard / patch on close.
  useEffect(() => {
    if (apiRef) apiRef.current = { flush, discard, getBody, isEmpty };
  }, [apiRef, flush, discard, getBody, isEmpty]);

  /** Open an attachment in the OS default app. */
  const handleOpenAttachment = (attachment: Attachment): void => {
    void openAttachment(attachment.path).catch((err: unknown) => {
      window.alert(`Couldn't open "${attachment.name}": ${errorMessageOf(err)}`);
    });
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="mx-auto flex h-full w-full max-w-[1000px] flex-col px-8">
        <EditorToolbar editor={editor} noteId={note.id} onAttach={addAttachments} onDelete={onDelete} />

        <div className="mb-3 mt-1 flex items-center gap-2.5 text-[12.5px] text-ink-2">
          {contextEditable ? (
            <ContextSwitcher value={context} onChange={setContext} />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-[3px] text-[12px] font-medium text-ink-2">
              <ContextDot context={context} size={6} />
              {context === "personal" ? "Personal" : "Office"}
            </span>
          )}
          {metaExtra}
          <span className="ml-auto text-xs text-ink-3">Edited {ageInDays(note.updated)}d ago</span>
        </div>

        {/* Title and body share one bordered frame, split by a hairline. Enter in
            the title drops into the body. */}
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

        {/* Quiet when empty: AttachmentList itself renders nothing, and this
            wrapper only exists (with its spacing) once there's something to show. */}
        {attachments.length > 0 && (
          <div className="-mt-4 mb-6">
            <AttachmentList
              attachments={attachments}
              onOpen={handleOpenAttachment}
              onRemove={(a) => removeAttachment(a.path)}
            />
          </div>
        )}
      </div>

      <EditorStyles />
    </div>
  );
}

/* ------------------------------------------------------------- editor styles
   Scoped ProseMirror styling for the serif WYSIWYG body, keyed off `.note-prose`. */

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
