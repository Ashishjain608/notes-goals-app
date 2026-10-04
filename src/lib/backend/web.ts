/**
 * The browser implementation of every ipc export (docs/adr/0011): the same
 * rules as src-tauri/src/ops.rs, over files in IndexedDB. `createWebBackend`
 * takes the files so tests can inject the in-memory ones.
 *
 * Deletes just remove the file. The phone does not sync `.atlas/`; the Mac
 * trashes the file when the delete reaches it (ADR-0011).
 */

import type {
  Attachment,
  CreateGoalInput,
  CreateNoteInput,
  CreateNotebookInput,
  CreateTaskInput,
  Goal,
  GoalDeletionResult,
  Note,
  NoteBodyHit,
  Notebook,
  NotebookDeletionResult,
  StoreSnapshot,
  Task,
} from "@/types";
import type { AvailableUpdate } from "@/lib/backend/tauri";
import { createIdbFiles, type VaultTextFiles } from "./idbFiles";
import {
  parseGoal,
  parseNotebook,
  parseNoteBody,
  parseNoteMeta,
  parseTask,
  renderGoal,
  renderNote,
  renderNotebook,
  renderTask,
} from "./vaultFormat";

/* ------------------------------------------------------------------ helpers */

/** Current instant as UTC ISO with seconds precision and 'Z' (ADR-0004), e.g. 2026-06-07T06:30:00Z. */
const nowUtc = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const newId = (): string => crypto.randomUUID();

const taskPath = (id: string) => `tasks/${id}.json`;
const goalPath = (id: string) => `goals/${id}.json`;
const notebookPath = (id: string) => `notebooks/${id}.json`;
const notePath = (id: string) => `notes/${id}.md`;

/** Mirrors the Rust completed rule: done sets (keeping an existing value), anything else clears. */
export function applyCompletedRule(task: Task): Task {
  if (task.status === "done") return { ...task, completed: task.completed ?? nowUtc() };
  return { ...task, completed: null };
}

const NOT_AVAILABLE = "Not available in the phone app";
const NO_ATTACHMENTS = "Adding or removing attachments isn't available in the phone app yet.";

/* ----------------------------------------------------------- body search */

const foldAscii = (c: string): string => (c >= "A" && c <= "Z" ? c.toLowerCase() : c);

/** Port of store_io.rs excerpt: 32 chars before, 72 after, whitespace collapsed, "…" where cut. Works on code points. */
function excerpt(chars: string[], at: number, needleLen: number): string {
  const start = Math.max(0, at - 32);
  const end = Math.min(chars.length, at + needleLen + 72);
  const text = chars.slice(start, end).join("").split(/\s+/).filter(Boolean).join(" ");
  return `${start > 0 ? "…" : ""}${text}${end < chars.length ? "…" : ""}`;
}

function findFolded(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** Pure search over (id, body) pairs, ASCII case-insensitive, at most `limit` hits. */
export function searchBodies(notes: Array<{ id: string; body: string }>, query: string, limit = 20): NoteBodyHit[] {
  const needle = Array.from(query.trim(), foldAscii);
  if (needle.length === 0) return [];
  const hits: NoteBodyHit[] = [];
  for (const { id, body } of notes) {
    if (hits.length >= limit) break;
    const chars = Array.from(body);
    const at = findFolded(chars.map(foldAscii), needle);
    if (at >= 0) hits.push({ id, snippet: excerpt(chars, at, needle.length) });
  }
  return hits;
}

/* ------------------------------------------------------------------ backend */

export function createWebBackend(files: VaultTextFiles) {
  const notFound = (path: string) => new Error(`Not found: ${path}`);

  /** Delete one entity file, plus any attachments folder it owned (the phone holds none, so this is the entity file). */
  async function remove(path: string, entityId: string): Promise<void> {
    if (!(await files.removeFile(path))) throw notFound(path);
    for (const a of await files.listDir(`attachments/${entityId}/`)) await files.removeFile(a);
  }

  /** Read and parse every file in `dir` with extension `ext`, skipping (and logging) bad ones. */
  async function loadCollection<T>(dir: string, ext: string, parse: (raw: string) => T): Promise<T[]> {
    const out: T[] = [];
    for (const path of await files.listDir(`${dir}/`)) {
      if (!path.endsWith(ext) || path.indexOf("/", dir.length + 1) !== -1) continue;
      try {
        const raw = await files.readText(path);
        if (raw !== null) out.push(parse(raw));
      } catch (err) {
        console.warn(`[notes-goals] skipping malformed file ${path}:`, err);
      }
    }
    return out;
  }

  const loadTasks = () => loadCollection("tasks", ".json", parseTask);
  const loadGoals = () => loadCollection("goals", ".json", parseGoal);
  const loadNotebooks = () => loadCollection("notebooks", ".json", parseNotebook);
  const loadNotes = () => loadCollection("notes", ".md", parseNoteMeta);

  const writeTask = (t: Task) => files.writeText(taskPath(t.id), renderTask(t));
  const writeGoal = (g: Goal) => files.writeText(goalPath(g.id), renderGoal(g));
  const writeNotebook = (n: Notebook) => files.writeText(notebookPath(n.id), renderNotebook(n));
  const writeNote = (n: Note, body: string) => files.writeText(notePath(n.id), renderNote(n, body));

  async function readNoteRaw(id: string): Promise<string> {
    const raw = await files.readText(notePath(id));
    if (raw === null) throw notFound(`notes/${id}`);
    return raw;
  }

  /** Re-write a note's frontmatter, keeping its body byte for byte. */
  async function rewriteNoteMeta(note: Note, edit: (n: Note) => Note): Promise<Note> {
    const body = parseNoteBody(await readNoteRaw(note.id));
    const edited = edit(note);
    await writeNote(edited, body);
    return edited;
  }

  return {
    /* Vault */
    getVaultPath: async (): Promise<string | null> => {
      try {
        return localStorage.getItem("ng-web-vault") === "dropbox" ? "Dropbox" : null;
      } catch {
        return null;
      }
    },
    getConfiguredVaultPath: async (): Promise<string | null> => null,
    chooseVault: async (): Promise<string | null> => {
      throw new Error(NOT_AVAILABLE);
    },
    relocateVault: async (_path: string): Promise<void> => {
      throw new Error(NOT_AVAILABLE);
    },

    /* Load */
    async loadAll(): Promise<StoreSnapshot> {
      const [tasks, notes, goals, notebooks] = await Promise.all([loadTasks(), loadNotes(), loadGoals(), loadNotebooks()]);
      return { tasks, notes, goals, notebooks };
    },
    async loadNoteBody(id: string): Promise<string> {
      return parseNoteBody(await readNoteRaw(id));
    },
    async searchNoteBodies(query: string): Promise<NoteBodyHit[]> {
      const notes: Array<{ id: string; body: string }> = [];
      for (const path of await files.listDir("notes/")) {
        if (!path.endsWith(".md")) continue;
        try {
          const raw = await files.readText(path);
          if (raw !== null) notes.push({ id: path.slice(6, -3), body: parseNoteBody(raw) });
        } catch {
          // unreadable or malformed: skipped, as in Rust
        }
      }
      return searchBodies(notes, query, 20);
    },

    /* Tasks */
    async createTask(input: CreateTaskInput): Promise<Task> {
      const task: Task = {
        id: newId(),
        title: input.title,
        context: input.context,
        status: "open",
        created: nowUtc(),
        due: input.due ?? null,
        snoozeUntil: null,
        completed: null,
        goalId: input.goalId ?? null,
        subtasks: [],
        details: "",
        priority: false,
        attachments: [],
        committedOn: null,
        carried: 0,
      };
      await writeTask(task);
      return task;
    },
    async updateTask(task: Task): Promise<Task> {
      const next = applyCompletedRule(task);
      await writeTask(next);
      return next;
    },
    deleteTask: (id: string): Promise<void> => remove(taskPath(id), id),

    /* Notes */
    async createNote(input: CreateNoteInput): Promise<Note> {
      const now = nowUtc();
      const note: Note = {
        id: newId(),
        title: input.title,
        context: input.context,
        goalId: input.goalId ?? null,
        notebookId: input.notebookId ?? null,
        created: now,
        updated: now,
        attachments: [],
        pinned: false,
      };
      await writeNote(note, input.body ?? "");
      return note;
    },
    async updateNote(note: Note, body: string): Promise<Note> {
      const next = { ...note, updated: nowUtc() };
      await writeNote(next, body);
      return next;
    },
    deleteNote: (id: string): Promise<void> => remove(notePath(id), id),
    async setNotePinned(id: string, pinned: boolean): Promise<Note> {
      const note = parseNoteMeta(await readNoteRaw(id));
      return rewriteNoteMeta(note, (n) => ({ ...n, pinned }));
    },
    async moveNote(id: string, notebookId: string | null): Promise<Note> {
      const note = parseNoteMeta(await readNoteRaw(id));
      return rewriteNoteMeta(note, (n) => ({ ...n, notebookId, updated: nowUtc() }));
    },

    /* Notebooks */
    async createNotebook(input: CreateNotebookInput): Promise<Notebook> {
      const now = nowUtc();
      const notebook: Notebook = { id: newId(), name: input.name, context: input.context, created: now, updated: now };
      await writeNotebook(notebook);
      return notebook;
    },
    async updateNotebook(notebook: Notebook): Promise<Notebook> {
      const next = { ...notebook, updated: nowUtc() };
      await writeNotebook(next);
      return next;
    },
    async deleteNotebook(id: string): Promise<NotebookDeletionResult> {
      const clearedNoteIds: string[] = [];
      for (const note of await loadNotes()) {
        if (note.notebookId !== id) continue;
        clearedNoteIds.push((await rewriteNoteMeta(note, (n) => ({ ...n, notebookId: null }))).id);
      }
      if (!(await files.removeFile(notebookPath(id)))) throw notFound(`notebooks/${id}`);
      return { clearedNoteIds };
    },

    /* Goals */
    async createGoal(input: CreateGoalInput): Promise<Goal> {
      const now = nowUtc();
      const goal: Goal = {
        id: newId(),
        title: input.title,
        description: input.description ?? "",
        context: input.context,
        status: "active",
        target: input.target ?? null,
        created: now,
        updated: now,
      };
      await writeGoal(goal);
      return goal;
    },
    async updateGoal(goal: Goal): Promise<Goal> {
      const next = { ...goal, updated: nowUtc() };
      await writeGoal(next);
      return next;
    },
    async deleteGoal(id: string): Promise<GoalDeletionResult> {
      const clearedTaskIds: string[] = [];
      for (const task of await loadTasks()) {
        if (task.goalId !== id) continue;
        await writeTask({ ...task, goalId: null });
        clearedTaskIds.push(task.id);
      }
      const clearedNoteIds: string[] = [];
      for (const note of await loadNotes()) {
        if (note.goalId !== id) continue;
        clearedNoteIds.push((await rewriteNoteMeta(note, (n) => ({ ...n, goalId: null }))).id);
      }
      if (!(await files.removeFile(goalPath(id)))) throw notFound(`goals/${id}`);
      return { clearedTaskIds, clearedNoteIds };
    },

    /* Attachments */
    attachFiles: async (_entityId: string, _paths: string[]): Promise<Attachment[]> => {
      throw new Error(NO_ATTACHMENTS);
    },
    attachBytes: async (_entityId: string, _name: string, _bytes: number[]): Promise<Attachment> => {
      throw new Error(NO_ATTACHMENTS);
    },
    removeAttachment: async (_path: string): Promise<void> => {
      throw new Error(NO_ATTACHMENTS);
    },
    openAttachment: async (path: string): Promise<void> => {
      if (!attachmentOpener) throw new Error("Opening attachments isn't available yet.");
      await attachmentOpener(path);
    },

    /* Updates */
    checkForUpdate: async (): Promise<AvailableUpdate | null> => null,
    relaunchApp: async (): Promise<void> => location.reload(),
  };
}

export type WebBackend = ReturnType<typeof createWebBackend>;

/* ------------------------------------------------- module-level instance */

let attachmentOpener: ((path: string) => Promise<void>) | null = null;

/** Register how an attachment is opened (the sync layer downloads it from Dropbox on demand). */
export function setWebAttachmentOpener(fn: (path: string) => Promise<void>): void {
  attachmentOpener = fn;
}

let files: VaultTextFiles | null = null;

/** The one IndexedDB-backed vault, created on first use; sync reuses it as its VaultFiles. */
export function webFiles(): VaultTextFiles {
  return (files ??= createIdbFiles());
}

let backend: WebBackend | null = null;
const be = (): WebBackend => (backend ??= createWebBackend(webFiles()));

export const getVaultPath: WebBackend["getVaultPath"] = () => be().getVaultPath();
export const getConfiguredVaultPath: WebBackend["getConfiguredVaultPath"] = () => be().getConfiguredVaultPath();
export const chooseVault: WebBackend["chooseVault"] = () => be().chooseVault();
export const relocateVault: WebBackend["relocateVault"] = (path) => be().relocateVault(path);
export const loadAll: WebBackend["loadAll"] = () => be().loadAll();
export const loadNoteBody: WebBackend["loadNoteBody"] = (id) => be().loadNoteBody(id);
export const searchNoteBodies: WebBackend["searchNoteBodies"] = (q) => be().searchNoteBodies(q);
export const createTask: WebBackend["createTask"] = (i) => be().createTask(i);
export const updateTask: WebBackend["updateTask"] = (t) => be().updateTask(t);
export const deleteTask: WebBackend["deleteTask"] = (id) => be().deleteTask(id);
export const createNote: WebBackend["createNote"] = (i) => be().createNote(i);
export const updateNote: WebBackend["updateNote"] = (n, b) => be().updateNote(n, b);
export const deleteNote: WebBackend["deleteNote"] = (id) => be().deleteNote(id);
export const moveNote: WebBackend["moveNote"] = (id, nb) => be().moveNote(id, nb);
export const createNotebook: WebBackend["createNotebook"] = (i) => be().createNotebook(i);
export const setNotePinned: WebBackend["setNotePinned"] = (id, p) => be().setNotePinned(id, p);
export const updateNotebook: WebBackend["updateNotebook"] = (n) => be().updateNotebook(n);
export const deleteNotebook: WebBackend["deleteNotebook"] = (id) => be().deleteNotebook(id);
export const createGoal: WebBackend["createGoal"] = (i) => be().createGoal(i);
export const updateGoal: WebBackend["updateGoal"] = (g) => be().updateGoal(g);
export const deleteGoal: WebBackend["deleteGoal"] = (id) => be().deleteGoal(id);
export const attachFiles: WebBackend["attachFiles"] = (id, p) => be().attachFiles(id, p);
export const attachBytes: WebBackend["attachBytes"] = (id, n, b) => be().attachBytes(id, n, b);
export const removeAttachment: WebBackend["removeAttachment"] = (p) => be().removeAttachment(p);
export const openAttachment: WebBackend["openAttachment"] = (p) => be().openAttachment(p);
export const checkForUpdate: WebBackend["checkForUpdate"] = () => be().checkForUpdate();
export const relaunchApp: WebBackend["relaunchApp"] = () => be().relaunchApp();
