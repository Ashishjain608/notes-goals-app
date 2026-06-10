/**
 * NoteEditorDrawer — a right-side drawer for adding/editing a note linked to the
 * current goal. Reuses the shared NoteEditor (with the context fixed to the
 * goal's) and the task-panel slide animation. A freshly-added note that's left
 * empty on close is discarded; otherwise edits autosave. The ⋯ menu offers Open
 * in Notes, Remove from goal, and Delete.
 */
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import type { Note } from "@/types";
import { useStore } from "@/store";
import { Icon } from "@/components";
import { NoteEditor, type NoteEditorApi } from "@/views/Notes/NoteEditor";
import type { NoteEditorStore } from "@/views/Notes/useNoteEditor";

/** Slightly longer than the slide-out so the drawer unmounts after it finishes. */
const EXIT_MS = 260;

export interface NoteEditorDrawerProps {
  /** The note being edited, or null when closed. */
  noteId: string | null;
  /** True when this note was just created via "Add note" (discard if left empty). */
  createdNew: boolean;
  goalTitle: string;
  onClose: () => void;
}

/** A single ⋯-menu row. */
function MenuItem({
  children,
  onClick,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-[13px] transition-colors ${
        danger ? "text-warn-ink hover:bg-warn-soft" : "text-ink-2 hover:bg-raise"
      }`}
    >
      {children}
    </button>
  );
}

/** The goal note editor drawer, or null when no note is open. */
export function NoteEditorDrawer({
  noteId,
  createdNew,
  goalTitle,
  onClose,
}: NoteEditorDrawerProps): JSX.Element | null {
  const notes = useStore((s) => s.notes);
  const theme = useStore((s) => s.theme);
  const getNoteBody = useStore((s) => s.getNoteBody);
  const saveNote = useStore((s) => s.saveNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const navigate = useStore((s) => s.navigate);
  const selectNote = useStore((s) => s.selectNote);

  const liveNote = noteId ? notes.find((n) => n.id === noteId) : undefined;
  const open = liveNote != null;

  // Stay mounted through the slide-out (same pattern as the task panel).
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastNoteRef = useRef<Note | undefined>(liveNote);
  if (liveNote) lastNoteRef.current = liveNote;

  const apiRef = useRef<NoteEditorApi | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setMenuOpen(false);
      return;
    }
    setClosing(true);
    const timer = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  const noteStore = useMemo<NoteEditorStore>(
    () => ({ getNoteBody, saveNote }),
    [getNoteBody, saveNote],
  );

  if (!mounted) return null;
  const note = liveNote ?? lastNoteRef.current;
  if (!note) return null;

  /** Persist real edits, or discard a fresh empty draft, then close. */
  const close = (): void => {
    if (createdNew && apiRef.current?.isEmpty()) {
      apiRef.current.discard();
      void deleteNote(note.id);
    } else {
      apiRef.current?.flush();
    }
    onClose();
  };

  const openInNotes = (): void => {
    apiRef.current?.flush();
    selectNote(note.id);
    navigate("notes");
    onClose();
  };

  const removeFromGoal = (): void => {
    // Clear the goal link in a single save using the editor's current body, so a
    // separate metadata write can't race the flush and clobber recent edits.
    const api = apiRef.current;
    api?.discard();
    void saveNote({ ...note, goalId: null }, api ? api.getBody() : "");
    onClose();
  };

  const confirmDelete = (): void => {
    if (!window.confirm(`Delete “${note.title || "Untitled"}”? This can't be undone.`)) return;
    apiRef.current?.discard();
    void deleteNote(note.id);
    onClose();
  };

  return (
    <>
      <div
        onClick={close}
        className={`fixed inset-0 z-[44] bg-[rgba(20,18,15,.18)] ${
          closing ? "ng-overlay-out" : "ng-overlay-in"
        }`}
      />
      <aside
        style={{ colorScheme: theme }}
        className={`fixed bottom-0 right-0 top-0 z-[45] flex w-[520px] max-w-[94vw] flex-col border-l border-line bg-surface shadow ${
          closing ? "ng-panel-out" : "ng-panel-in"
        }`}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-2">
            <Icon name="notes" size={15} className="text-ink-3" />
            <span className="font-medium">Note</span>
            <span className="text-ink-3">·</span>
            <span className="min-w-0 truncate text-ink-3" title={goalTitle}>
              {goalTitle}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                aria-label="Note actions"
                onClick={() => setMenuOpen((v) => !v)}
                className="grid h-7 w-7 place-items-center rounded-md text-[18px] leading-none text-ink-3 transition-colors hover:bg-raise hover:text-ink-2"
              >
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow">
                    <MenuItem onClick={openInNotes}>Open in Notes</MenuItem>
                    <MenuItem onClick={removeFromGoal}>Remove from goal</MenuItem>
                    <MenuItem danger onClick={confirmDelete}>
                      Delete note
                    </MenuItem>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raise"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <NoteEditor note={note} store={noteStore} contextEditable={false} apiRef={apiRef} />
        </div>
      </aside>
    </>
  );
}

export default NoteEditorDrawer;
