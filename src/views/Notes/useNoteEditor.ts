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
 *
 * Attachments: `note.attachments` (YAML-frontmatter metadata, not the body) is
 * mirrored as working state the same way title/context are. Adding or removing
 * one is a discrete change, so — like `setContext` — it persists immediately via
 * `flush()` rather than waiting for the body's debounce, and `flush()` always
 * reads the live body first, so an immediate attachment save can never clobber
 * in-flight typing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import type { EditorProps } from "@tiptap/pm/view";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Attachment, Context, Note } from "@/types";
import { buildNoteExtensions } from "@/lib/markdown";
import { errorMessageOf } from "@/lib/errors";

/** ~800ms debounce window for autosave (ADR-0005). */
const AUTOSAVE_DEBOUNCE_MS = 800;

/** True for http(s) / mailto URLs we'd turn pasted text into a link for. */
function isLinkableUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text) || /^mailto:\S+@\S+$/i.test(text);
}

/** True for a note attachment's vault-relative href (the frozen `Attachment.path`
 *  shape, "attachments/<noteId>/<file>" — src/types.ts). Everything else is a
 *  real URL routed to the OS opener. */
function isAttachmentHref(href: string): boolean {
  return href.startsWith("attachments/");
}

/**
 * Attach one pasted file to `noteId` via the store and hand the created
 * record to `addAttachment` — same handoff the toolbar's Attach button uses,
 * just fed by a paste instead of the file picker. No content is inserted into
 * the editor. `attachToStore` already names the file (store.attachPastedFile).
 */
async function attachPastedFile(
  noteId: string,
  file: File,
  attachToStore: (entityId: string, file: File) => Promise<Attachment>,
  addAttachment: (created: Attachment) => void,
): Promise<void> {
  try {
    const attachment = await attachToStore(noteId, file);
    addAttachment(attachment);
  } catch (err) {
    window.alert(`Couldn't attach the pasted file: ${errorMessageOf(err)}`);
  }
}

/**
 * Build the ProseMirror-level editor behaviors that don't depend on React
 * state. A factory (not a plain object) because the editor instance is
 * created once and reused across note switches (see file header) — reading
 * the live note id through `getNoteId` at event time (rather than closing
 * over one fixed id) keeps paste-to-attach correct across switches without
 * recreating the editor.
 * - Cmd/Ctrl-click a link opens it: an attachment href via the store's
 *   `openAttachment`, any other via the OS default browser (Tauri opener).
 *   Plain click keeps editing the text. This stays for legacy notes whose
 *   body already contains an inline `attachments/...` link from before the
 *   attachment strip existed.
 * - Pasting a file/image attaches it via `getAddAttachment()` (see
 *   attachPastedFile) — nothing is inserted into the editor.
 * - Pasting a URL over a non-empty selection links the selection instead of
 *   replacing it; anything else falls through to the default (markdown) paste.
 */
function createNoteEditorProps(
  getNoteId: () => string | null,
  getAddAttachment: () => (created: Attachment) => void,
  getAttachPastedFile: () => (entityId: string, file: File) => Promise<Attachment>,
  getOpenAttachment: () => (path: string) => Promise<void>,
): EditorProps {
  return {
    handleDOMEvents: {
      click: (_view, event) => {
        const anchor = (event.target as HTMLElement | null)?.closest("a");
        if (!anchor || !(event.metaKey || event.ctrlKey)) return false;
        const href = anchor.getAttribute("href");
        if (!href) return false;
        event.preventDefault();
        if (isAttachmentHref(href)) {
          void getOpenAttachment()(decodeURI(href)).catch((err: unknown) => {
            window.alert(`Couldn't open the attachment: ${errorMessageOf(err)}`);
          });
        } else {
          void openUrl(href);
        }
        return true;
      },
    },
    handlePaste: (view, event) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        const noteId = getNoteId();
        if (!noteId) return false; // nothing loaded to attach against yet
        const addAttachment = getAddAttachment();
        const attachToStore = getAttachPastedFile();
        for (const file of files) void attachPastedFile(noteId, file, attachToStore, addAttachment);
        return true;
      }
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
}

/** The minimal store surface this hook needs (decoupled from the full store). */
export interface NoteEditorStore {
  getNoteBody: (id: string) => Promise<string>;
  saveNote: (note: Note, body: string) => Promise<void>;
  /** Attach a pasted file's bytes only — no entity patch; the caller (this hook) holds its own list. */
  attachPastedFile: (entityId: string, file: File) => Promise<Attachment>;
  /** Move an attachment file to trash — no entity patch; the caller updates its own list. */
  trashAttachment: (path: string) => Promise<void>;
  /** Open an attachment in the OS default app. */
  openAttachment: (path: string) => Promise<void>;
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
  /** Persist any pending edit immediately (e.g. before closing a drawer). */
  flush: () => void;
  /** Cancel a pending autosave without persisting (discard an empty draft). */
  discard: () => void;
  /**
   * Discard any pending autosave and persist `{...note, ...patch}` with the
   * live body in ONE save, so a separate metadata write can't race the flush.
   */
  saveWith: (patch: Partial<Note>) => void;
  /** The editor's current markdown body (for a host that writes its own patch). */
  getBody: () => string;
  /** True when the working title and body are both blank (an empty draft). */
  isEmpty: () => boolean;
  /** Working copy of the note's attachments (YAML frontmatter, not the body). */
  attachments: Attachment[];
  /** Append newly created attachments and persist immediately with the live body. */
  addAttachments: (created: Attachment[]) => void;
  /** Move an attachment to trash, drop it from the list, and persist immediately. */
  removeAttachment: (path: string) => void;
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
  // The id whose content currently lives in the editor — declared ahead of
  // `useEditor` so the (single, reused) editor's paste handler can always read
  // the *live* note through this ref rather than the note passed in at the
  // moment the editor was constructed.
  const loadedIdRef = useRef<string | null>(null);
  // Forwards to the current `addAttachments` below; the editor (and its props)
  // is created exactly once, so paste must read this indirectly rather than
  // closing over a callback that changes identity across renders.
  const addAttachmentsRef = useRef<(created: Attachment[]) => void>(() => {});
  // Forward to the live store methods the same way, since `store` may change
  // identity across renders but the editor (and its props) is created once.
  const attachPastedFileRef = useRef(store.attachPastedFile);
  attachPastedFileRef.current = store.attachPastedFile;
  const openAttachmentRef = useRef(store.openAttachment);
  openAttachmentRef.current = store.openAttachment;
  const editorProps = useMemo(
    () =>
      createNoteEditorProps(
        () => loadedIdRef.current,
        () => (created: Attachment) => addAttachmentsRef.current([created]),
        () => attachPastedFileRef.current,
        () => openAttachmentRef.current,
      ),
    [],
  );
  const editor = useEditor(
    { extensions, immediatelyRender: false, editorProps },
    [],
  );

  const [title, setTitleState] = useState(note?.title ?? "");
  const [context, setContextState] = useState<Context>(note?.context ?? "office");
  const [attachments, setAttachmentsState] = useState<Attachment[]>(note?.attachments ?? []);
  const [loadingBody, setLoadingBody] = useState(false);

  // Keep the latest onBody in a ref so callbacks stay stable across renders.
  const onBodyRef = useRef(options.onBody);
  onBodyRef.current = options.onBody;

  // Body cache (per note id) so re-selecting a note never re-fetches from disk.
  const bodyCache = useRef<Map<string, string>>(new Map());
  // loadedIdRef (declared above, ahead of useEditor) guards setContent so it
  // only runs on an actual switch, never on a keystroke-driven re-render.
  // Pending autosave timer + the exact metadata to persist when it fires.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNoteRef = useRef<Note | null>(null);
  // Mirror the working title for save payloads without re-arming effects.
  const titleRef = useRef(title);
  titleRef.current = title;
  // Mirror the working context the same way.
  const contextRef = useRef(context);
  contextRef.current = context;
  // Mirror the working attachments the same way.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

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
      {
        ...target,
        title: titleRef.current,
        context: contextRef.current,
        attachments: attachmentsRef.current,
      },
      body,
    );
  }, [editor, store]);

  /** Cancel a pending autosave + clear the pending target (no write happens). */
  const discard = useCallback((): void => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingNoteRef.current = null;
  }, []);

  /**
   * Discard any pending autosave and persist `{...note, ...patch}` with the
   * live body in one save — used for a metadata change (e.g. clearing the
   * goal link) that must land atomically with whatever's currently typed,
   * with no separate write that could race the debounce.
   */
  const saveWith = useCallback(
    (patch: Partial<Note>): void => {
      discard();
      if (!note) return;
      const body = editor ? getMarkdown(editor) : "";
      bodyCache.current.set(note.id, body);
      onBodyRef.current?.(note.id, body);
      void store.saveNote({ ...note, ...patch }, body);
    },
    [note, editor, store, discard],
  );

  /** The editor's current markdown body. */
  const getBody = useCallback((): string => (editor ? getMarkdown(editor) : ""), [editor]);

  /** True when the working title and the editor body are both blank. */
  const isEmpty = useCallback((): boolean => {
    const blankTitle = (titleRef.current ?? "").trim() === "";
    const blankBody = editor ? getMarkdown(editor).trim() === "" : true;
    return blankTitle && blankBody;
  }, [editor]);

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

  /** Append newly created attachments — a discrete change, so persist it immediately. */
  const addAttachments = useCallback(
    (created: Attachment[]) => {
      if (created.length === 0) return;
      const next = [...attachmentsRef.current, ...created];
      setAttachmentsState(next);
      attachmentsRef.current = next;
      if (!note || note.id !== loadedIdRef.current) return; // nothing loaded yet
      pendingNoteRef.current = note;
      flush();
    },
    [note, flush],
  );
  addAttachmentsRef.current = addAttachments;

  /** Trash the file, drop it from the working list, and persist immediately. */
  const removeAttachment = useCallback(
    (path: string) => {
      void (async () => {
        try {
          await store.trashAttachment(path);
        } catch (err) {
          window.alert(`Couldn't remove the attachment: ${errorMessageOf(err)}`);
          return;
        }
        const next = attachmentsRef.current.filter((a) => a.path !== path);
        setAttachmentsState(next);
        attachmentsRef.current = next;
        if (!note || note.id !== loadedIdRef.current) return; // nothing loaded yet
        pendingNoteRef.current = note;
        flush();
      })();
    },
    [note, flush, store],
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
      setAttachmentsState([]);
      attachmentsRef.current = [];
      return;
    }

    const targetId = note.id;
    setTitleState(note.title);
    titleRef.current = note.title;
    setContextState(note.context);
    contextRef.current = note.context;
    setAttachmentsState(note.attachments);
    attachmentsRef.current = note.attachments;

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

  return {
    editor,
    title,
    setTitle,
    context,
    setContext,
    loadingBody,
    flush,
    discard,
    saveWith,
    getBody,
    isEmpty,
    attachments,
    addAttachments,
    removeAttachment,
  };
}

/** Replace the editor's content with markdown without emitting an `update`. */
function applyBody(editor: Editor, markdown: string): void {
  editor.setEditable(true);
  // `emitUpdate: false` keeps this content reset from arming the autosave.
  editor.commands.setContent(markdown, false);
}
