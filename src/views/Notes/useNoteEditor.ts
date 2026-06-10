/**
 * useNoteEditor — owns the TipTap editor lifecycle and debounced autosave for
 * the Notes view (docs/adr/0005).
 *
 * Lifecycle: a single TipTap editor instance is created once and reused. When
 * the selected note changes we lazily fetch its markdown body (cached per id),
 * then `setContent` the editor — content is set ONLY on note switch, never on a
 * keystroke, so store updates and editor state never feed back into each other.
 *
 * Autosave: title and body edits each (re)arm an ~800ms debounce. On fire we
 * serialize the body via `editor.storage.markdown.getMarkdown()` and persist the
 * current note metadata + body through `store.saveNote`; Rust bumps `updated`.
 * The pending save is flushed synchronously before switching notes and on
 * unmount, so no edit is ever lost.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import type { EditorProps } from "@tiptap/pm/view";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Context, Note } from "@/types";
import { buildNoteExtensions } from "@/lib/markdown";

/** ~800ms debounce window for autosave (ADR-0005). */
const AUTOSAVE_DEBOUNCE_MS = 800;

/** True for http(s) / mailto URLs we'd turn pasted text into a link for. */
function isLinkableUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text) || /^mailto:\S+@\S+$/i.test(text);
}

/**
 * ProseMirror-level editor behaviors that don't depend on React state:
 * - Cmd/Ctrl-click a link opens it in the OS default browser (Tauri opener),
 *   never navigating the webview itself. Plain click keeps editing the text.
 * - Pasting a URL over a non-empty selection links the selection instead of
 *   replacing it; anything else falls through to the default (markdown) paste.
 */
const NOTE_EDITOR_PROPS: EditorProps = {
  handleDOMEvents: {
    click: (_view, event) => {
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || !(event.metaKey || event.ctrlKey)) return false;
      const href = anchor.getAttribute("href");
      if (!href) return false;
      event.preventDefault();
      void openUrl(href);
      return true;
    },
  },
  handlePaste: (view, event) => {
    const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
    if (!isLinkableUrl(text)) return false;
    const { from, to, empty } = view.state.selection;
    if (empty) return false; // no selection → let the default (markdown) paste run
    const linkMark = view.state.schema.marks.link;
    if (!linkMark) return false;
    view.dispatch(view.state.tr.addMark(from, to, linkMark.create({ href: text })));
    return true;
  },
};

/** The minimal store surface this hook needs (decoupled from the full store). */
export interface NoteEditorStore {
  getNoteBody: (id: string) => Promise<string>;
  saveNote: (note: Note, body: string) => Promise<void>;
}

export interface UseNoteEditorOptions {
  /**
   * Notified with the latest markdown whenever a body is loaded or autosaved,
   * so the caller (the list) can keep its excerpt preview in sync.
   */
  onBody?: (id: string, markdown: string) => void;
}

export interface UseNoteEditorResult {
  /** The live TipTap editor (null until first client render). */
  editor: Editor | null;
  /** Working copy of the title (metadata, edited separately from the body). */
  title: string;
  /** Edit the title; arms the autosave debounce. */
  setTitle: (next: string) => void;
  /** Working copy of the context (office | personal). */
  context: Context;
  /** Switch the note's context; persists immediately with the live body. */
  setContext: (next: Context) => void;
  /** True while the selected note's body is being fetched for the first time. */
  loadingBody: boolean;
}

/** tiptap-markdown augments `editor.storage.markdown`; read it through here. */
function getMarkdown(editor: Editor): string {
  const storage = editor.storage as { markdown?: { getMarkdown: () => string } };
  return storage.markdown?.getMarkdown() ?? "";
}

/**
 * Drive the note editor for `note`. Pass `null` when no note is selected (the
 * editor is emptied and made non-editable).
 */
export function useNoteEditor(
  note: Note | null,
  store: NoteEditorStore,
  options: UseNoteEditorOptions = {},
): UseNoteEditorResult {
  const extensions = useMemo(() => buildNoteExtensions(), []);
  const editor = useEditor(
    { extensions, immediatelyRender: false, editorProps: NOTE_EDITOR_PROPS },
    [],
  );

  const [title, setTitleState] = useState(note?.title ?? "");
  const [context, setContextState] = useState<Context>(note?.context ?? "office");
  const [loadingBody, setLoadingBody] = useState(false);

  // Keep the latest onBody in a ref so callbacks stay stable across renders.
  const onBodyRef = useRef(options.onBody);
  onBodyRef.current = options.onBody;

  // Body cache (per note id) so re-selecting a note never re-fetches from disk.
  const bodyCache = useRef<Map<string, string>>(new Map());
  // The id whose content currently lives in the editor — guards setContent so it
  // only runs on an actual switch, never on a keystroke-driven re-render.
  const loadedIdRef = useRef<string | null>(null);
  // Pending autosave timer + the exact metadata to persist when it fires.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNoteRef = useRef<Note | null>(null);
  // Mirror the working title for save payloads without re-arming effects.
  const titleRef = useRef(title);
  titleRef.current = title;
  // Mirror the working context the same way.
  const contextRef = useRef(context);
  contextRef.current = context;

  /** Persist the pending edit immediately and cancel the debounce. */
  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const target = pendingNoteRef.current;
    pendingNoteRef.current = null;
    if (!target || !editor) return;

    const body = getMarkdown(editor);
    bodyCache.current.set(target.id, body);
    onBodyRef.current?.(target.id, body);
    void store.saveNote(
      { ...target, title: titleRef.current, context: contextRef.current },
      body,
    );
  }, [editor, store]);

  /** Arm (or re-arm) the ~800ms debounce against the currently loaded note. */
  const scheduleSave = useCallback(() => {
    const id = loadedIdRef.current;
    if (!note || note.id !== id) return; // nothing loaded yet / mid-switch
    pendingNoteRef.current = note;
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  }, [note, flush]);

  /** Title edits live in React state but share the same autosave debounce. */
  const setTitle = useCallback(
    (next: string) => {
      setTitleState(next);
      titleRef.current = next;
      scheduleSave();
    },
    [scheduleSave],
  );

  /** Switch the note's context — a discrete choice, so persist it immediately. */
  const setContext = useCallback(
    (next: Context) => {
      setContextState(next);
      contextRef.current = next;
      if (!note || note.id !== loadedIdRef.current) return; // nothing loaded yet
      pendingNoteRef.current = note;
      flush();
    },
    [note, flush],
  );

  // Body edits → schedule a save. Registered once; reads live refs internally.
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => scheduleSave();
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, scheduleSave]);

  // Switch notes: flush the outgoing edit, then load + set the incoming body.
  useEffect(() => {
    if (!editor) return;
    const nextId = note?.id ?? null;
    if (nextId === loadedIdRef.current) return; // same note — no content reset

    // Persist whatever was pending for the note we're leaving.
    flush();

    if (note === null) {
      loadedIdRef.current = null;
      editor.commands.clearContent();
      editor.setEditable(false);
      setTitleState("");
      return;
    }

    const targetId = note.id;
    setTitleState(note.title);
    titleRef.current = note.title;
    setContextState(note.context);
    contextRef.current = note.context;

    const cached = bodyCache.current.get(targetId);
    if (cached !== undefined) {
      applyBody(editor, cached);
      loadedIdRef.current = targetId;
      onBodyRef.current?.(targetId, cached);
      return;
    }

    let cancelled = false;
    setLoadingBody(true);
    void store
      .getNoteBody(targetId)
      .then((body) => {
        if (cancelled) return;
        bodyCache.current.set(targetId, body);
        applyBody(editor, body);
        loadedIdRef.current = targetId;
        onBodyRef.current?.(targetId, body);
      })
      .catch(() => {
        if (cancelled) return;
        applyBody(editor, "");
        loadedIdRef.current = targetId;
      })
      .finally(() => {
        if (!cancelled) setLoadingBody(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editor, note, flush]);

  // Flush any pending save when the component unmounts.
  useEffect(() => () => flush(), [flush]);

  return { editor, title, setTitle, context, setContext, loadingBody };
}

/** Replace the editor's content with markdown without emitting an `update`. */
function applyBody(editor: Editor, markdown: string): void {
  editor.setEditable(true);
  // `emitUpdate: false` keeps this content reset from arming the autosave.
  editor.commands.setContent(markdown, false);
}
