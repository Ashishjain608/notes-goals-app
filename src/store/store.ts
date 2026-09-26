/**
 * The in-memory store (Zustand) — one mirror of the loaded entity graph plus
 * the app's UI state. It is the only stateful layer; disk is the source of
 * truth and every mutating action persists through `@/lib/ipc` (await-then-
 * update, no optimistic UI — local writes are sub-ms per ADR-0006).
 *
 * Theme, nav-collapsed and slate cap are per-Mac preferences (`@/lib/prefs`,
 * mirrored to localStorage); the vault path is owned by Rust.
 *
 * Task (and notebook) edits route through `mutateTask` / `mutateNotebook`:
 * both read the LATEST entity from state only once their turn comes up in a
 * per-id promise chain (`chained`), so two quick edits on the same entity
 * always merge onto each other rather than a snapshot taken before an earlier
 * one's `await`. `reload()` is the focus-reload; it's guarded by a module-
 * level in-flight counter (`savePendingCount`, not a boolean — two overlapping
 * saves must each hold the guard until THEY finish) so a focus event never
 * clobbers an in-flight edit (docs/IMPLEMENTATION_PLAN.md §6).
 */

import { create } from "zustand";
import type {
  Attachment,
  ContextFilter,
  CreateGoalInput,
  CreateNoteInput,
  CreateNotebookInput,
  CreateTaskInput,
  Goal,
  IsoDate,
  Note,
  NoteBodyHit,
  Notebook,
  Task,
  TaskStatus,
} from "@/types";
import * as ipc from "@/lib/ipc";
import { localToday } from "@/lib/dates";
import { errorMessageOf } from "@/lib/errors";
import { fileBytes, pastedFileName } from "@/lib/attachments";
import * as prefs from "@/lib/prefs";
import { clampSlateCap, commitTransition } from "./slate";
import { reconcileNoteGoal, reconcileNoteNotebook } from "./selectors";

export type AppStatus = "loading" | "needs-vault" | "ready" | "error";
export type Screen = "today" | "tasks" | "notes" | "goals" | "goal" | "activity";
export type Theme = "light" | "dark";

/** The Task fields a view may patch directly. */
export type TaskPatch = Partial<
  Pick<Task, "title" | "details" | "due" | "snoozeUntil" | "goalId" | "subtasks" | "priority" | "attachments">
>;

export interface AppState {
  // data
  vaultPath: string | null;
  /** The configured path when it's currently unreachable (e.g. an unmounted
   * drive) — set only while `status` is "needs-vault" for that reason, so
   * VaultGate can say *why* rather than looking like a first run. */
  missingVaultPath: string | null;
  status: AppStatus;
  errorMessage: string | null;
  tasks: Task[];
  notes: Note[];
  goals: Goal[];
  notebooks: Notebook[];
  // ui
  contextFilter: ContextFilter;
  theme: Theme;
  navCollapsed: boolean;
  /** How many tasks today's slate holds — the user's choice, per Mac (ADR-0010). */
  slateCap: number;
  /** Today's local calendar date. UI-only: `refreshDay()` re-sets it so a
   * day-boundary view (Today, the slate) notices midnight even when nothing
   * else in the store changed (App.tsx polls it + re-checks on focus). */
  day: IsoDate;
  route: { screen: Screen; goalId: string | null };
  detailTaskId: string | null;
  paletteOpen: boolean;
  selectedNoteId: string | null;
  scratchOpen: boolean;
  settingsOpen: boolean;
  /** A newer release, once found: downloading in the background, then ready to restart into. */
  update: { version: string; phase: "downloading" | "ready" } | null;

  // lifecycle
  init: () => Promise<void>;
  chooseVault: () => Promise<void>;
  relocateVault: (path: string) => Promise<void>;
  reload: () => Promise<void>;
  /** Re-check the local calendar day, updating `day` only when it actually changed. */
  refreshDay: () => void;

  // ui actions
  setContextFilter: (c: ContextFilter) => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleNav: () => void;
  setSlateCap: (cap: number) => void;
  navigate: (screen: Screen, goalId?: string | null) => void;
  openTaskDetail: (id: string) => void;
  closeTaskDetail: () => void;
  openPalette: () => void;
  closePalette: () => void;
  selectNote: (id: string | null) => void;
  toggleScratch: () => void;
  closeScratch: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  checkForUpdate: () => Promise<void>;
  restartToUpdate: () => Promise<void>;
  toggleSettings: () => void;

  // task actions
  addTask: (input: CreateTaskInput) => Promise<Task>;
  toggleTaskStatus: (id: string) => Promise<void>;
  setTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  /**
   * Patch a task. Pass a function when the patch depends on the task's current
   * value (a subtask list, say): it receives the latest task, so rapid edits
   * never build on a stale render.
   */
  patchTask: (id: string, patch: TaskPatch | ((t: Task) => TaskPatch)) => Promise<void>;
  toggleTaskPriority: (id: string) => Promise<void>;
  /**
   * Put a task on today's slate, or take it off. Resolves false when the slate
   * is already at `slateCap` — the caller shows why rather than silently doing
   * nothing.
   */
  toggleTaskCommit: (id: string) => Promise<boolean>;
  deleteTask: (id: string) => Promise<void>;
  /** Copy files already on disk (e.g. from the native file picker) into the vault and append them to the task. */
  attachFilesToTask: (id: string, paths: string[]) => Promise<void>;
  /**
   * Attach pasted files one at a time. A file that fails is reported to
   * `onFileError` and skipped; the rest still attach.
   */
  attachPastedToTask: (id: string, files: File[], onFileError: (err: unknown) => void) => Promise<void>;
  /** Trash an attachment file and drop it from the task's attachment list. */
  removeTaskAttachment: (id: string, path: string) => Promise<void>;

  // note actions
  addNote: (input: CreateNoteInput) => Promise<Note>;
  saveNote: (note: Note, body: string) => Promise<void>;
  getNoteBody: (id: string) => Promise<string>;
  deleteNote: (id: string) => Promise<void>;
  /** File a note into a notebook, or null to unfile (persists via move_note). */
  moveNoteToNotebook: (id: string, notebookId: string | null) => Promise<void>;

  // notebook actions
  addNotebook: (input: CreateNotebookInput) => Promise<Notebook>;
  renameNotebook: (id: string, name: string) => Promise<void>;
  deleteNotebook: (id: string) => Promise<void>;

  // goal actions
  addGoal: (input: CreateGoalInput) => Promise<Goal>;
  saveGoal: (goal: Goal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  // shared IO passthroughs — notes keep their OWN working attachment list
  // (autosaved with the body by useNoteEditor) rather than an entity patch here.
  /** Attach a pasted file's bytes only — no entity patch; the caller (the note editor) holds its own list. */
  attachPastedFile: (entityId: string, file: File) => Promise<Attachment>;
  /** Copy picked files into the vault only — no entity patch; the caller (the note editor) holds its own list. */
  attachPickedFiles: (entityId: string, paths: string[]) => Promise<Attachment[]>;
  /** Move an attachment file to trash — no entity patch; the caller updates its own list. */
  trashAttachment: (path: string) => Promise<void>;
  /** Open an attachment in the OS default app. */
  openAttachment: (path: string) => Promise<void>;
  /** Search note bodies on disk (titles/tasks/goals/notebooks are already in the store and matched there). */
  searchNoteBodies: (query: string) => Promise<NoteBodyHit[]>;
}

/* ------------------------------------------------------------- theme config */

/** The app's light/dark mode maps onto Spectrum's two `data-theme` values. */
const DOM_THEME: Record<Theme, string> = { light: "spectrum", dark: "spectrum-dark" };

/** Apply the theme to the document (the shell reads `data-theme`) + persist it. */
function applyTheme(theme: Theme): void {
  prefs.writeTheme(theme);
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("data-theme", DOM_THEME[theme]);
  }
}

/* ----------------------------------------------------------- save guard ---
   Module-level so a window-focus reload can tell whether a mutation is mid-
   flight and skip itself rather than overwrite the optimistic local state. A
   COUNTER, not a boolean: withSaveGuard calls can nest (e.g. attachFilesToTask
   guards its own ipc.attachFiles call, then mutateTask guards the ipc.updateTask
   inside it) and two top-level saves can overlap — a boolean's `finally` would
   clear the guard as soon as EITHER finished, letting reload() clobber the one
   still in flight. */

let savePendingCount = 0;

/** Run a mutating IPC call with the save guard raised for its full duration. */
async function withSaveGuard<T>(fn: () => Promise<T>): Promise<T> {
  savePendingCount += 1;
  try {
    return await fn();
  } finally {
    savePendingCount -= 1;
  }
}

/* ------------------------------------------------------- serialized mutation
   Reading `current` before an `await` lets a second mutation on the same
   entity start from a stale snapshot and silently drop the first one's
   change (two quick patchTask calls on one task, say). `chained` runs calls
   for the same key strictly one after another — a promise chain keyed by id —
   so each mutation's turn only comes up once the previous one for that id has
   finished; the mutator then reads state fresh, at that moment, rather than a
   snapshot taken before anything was awaited. Different keys (other ids, other
   entity kinds) run fully concurrently. One failed mutation is swallowed for
   chaining purposes only — it doesn't jam the chain for the next call — but
   still rejects the promise returned to ITS OWN caller. */

const mutationChains = new Map<string, Promise<unknown>>();

function chained<T>(key: string, run: () => Promise<T>): Promise<T> {
  const prior = mutationChains.get(key) ?? Promise.resolve();
  const next = prior.catch(() => {}).then(run);
  mutationChains.set(key, next);
  return next;
}

/* ---------------------------------------------------------------- the store */

export const useStore = create<AppState>((set, get) => {
  /**
   * Apply `fn` to the LATEST task `id` at the moment this mutation's turn in
   * its per-id chain comes up, persist the result via `ipc.updateTask`, and
   * merge the persisted task back into state. `fn` may return `null` to abort
   * without persisting (a rejected slate commit) — disk and the store are
   * left untouched, and no ipc call is made. Every task-patching action
   * routes through this (file header).
   */
  function mutateTask(id: string, fn: (t: Task) => Task | null): Promise<Task | undefined> {
    return chained(`task:${id}`, async () => {
      const current = get().tasks.find((t) => t.id === id);
      if (!current) return undefined;
      const next = fn(current);
      if (next === null) return undefined;
      const updated = await withSaveGuard(() => ipc.updateTask(next));
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
      return updated;
    });
  }

  /** Same idea as `mutateTask`, for notebooks (currently just `renameNotebook`). */
  function mutateNotebook(id: string, fn: (n: Notebook) => Notebook): Promise<Notebook | undefined> {
    return chained(`notebook:${id}`, async () => {
      const current = get().notebooks.find((n) => n.id === id);
      if (!current) return undefined;
      const updated = await withSaveGuard(() => ipc.updateNotebook(fn(current)));
      set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === id ? updated : n)) }));
      return updated;
    });
  }

  return {
    // data
    vaultPath: null,
    missingVaultPath: null,
    status: "loading",
    errorMessage: null,
    tasks: [],
    notes: [],
    goals: [],
    notebooks: [],
    // ui
    contextFilter: "all",
    theme: "light",
    navCollapsed: prefs.readNavCollapsed(),
    slateCap: prefs.readSlateCap(),
    day: localToday(),
    route: { screen: "today", goalId: null },
    detailTaskId: null,
    paletteOpen: false,
    selectedNoteId: null,
    scratchOpen: false,
    settingsOpen: false,
    update: null,

    /* ------------------------------------------------------------- lifecycle */

    init: async () => {
      const theme = prefs.readTheme();
      applyTheme(theme);
      set({ theme });

      let vaultPath: string | null = null;
      try {
        vaultPath = await ipc.getVaultPath();
        if (vaultPath === null) {
          // Distinguish "never configured" (first run) from "configured but
          // currently unreachable" (e.g. an unmounted drive) so VaultGate can
          // say which.
          const missingVaultPath = await ipc.getConfiguredVaultPath();
          set({ vaultPath: null, missingVaultPath, status: "needs-vault", errorMessage: null });
          return;
        }
        const snapshot = await ipc.loadAll();
        set({
          vaultPath,
          missingVaultPath: null,
          tasks: snapshot.tasks,
          notes: snapshot.notes,
          goals: snapshot.goals,
          notebooks: snapshot.notebooks,
          status: "ready",
          errorMessage: null,
        });
      } catch (err) {
        set({ status: "error", errorMessage: errorMessageOf(err), missingVaultPath: vaultPath });
      }
    },

    chooseVault: async () => {
      let vaultPath: string | null = null;
      try {
        vaultPath = await ipc.chooseVault();
        if (vaultPath === null) return; // user cancelled the picker
        const snapshot = await ipc.loadAll();
        set({
          vaultPath,
          missingVaultPath: null,
          tasks: snapshot.tasks,
          notes: snapshot.notes,
          goals: snapshot.goals,
          notebooks: snapshot.notebooks,
          status: "ready",
          errorMessage: null,
        });
      } catch (err) {
        set({ status: "error", errorMessage: errorMessageOf(err), missingVaultPath: vaultPath });
      }
    },

    relocateVault: async (path) => {
      try {
        await ipc.relocateVault(path);
        const snapshot = await ipc.loadAll();
        set({
          vaultPath: path,
          missingVaultPath: null,
          tasks: snapshot.tasks,
          notes: snapshot.notes,
          goals: snapshot.goals,
          notebooks: snapshot.notebooks,
          status: "ready",
          errorMessage: null,
        });
      } catch (err) {
        set({ status: "error", errorMessage: errorMessageOf(err), missingVaultPath: path });
      }
    },

    reload: async () => {
      if (savePendingCount > 0) return; // an edit is mid-flight — don't clobber it
      try {
        const snapshot = await ipc.loadAll();
        set({
          tasks: snapshot.tasks,
          notes: snapshot.notes,
          goals: snapshot.goals,
          notebooks: snapshot.notebooks,
        });
      } catch (err) {
        set({ status: "error", errorMessage: errorMessageOf(err) });
      }
    },

    refreshDay: () => {
      const today = localToday();
      if (get().day !== today) set({ day: today });
    },

    /* ------------------------------------------------------------ ui actions */

    setContextFilter: (c) => set({ contextFilter: c }),

    setTheme: (t) => {
      applyTheme(t);
      set({ theme: t });
    },

    toggleTheme: () => {
      const next: Theme = get().theme === "dark" ? "light" : "dark";
      applyTheme(next);
      set({ theme: next });
    },

    toggleNav: () => {
      const next = !get().navCollapsed;
      prefs.writeNavCollapsed(next);
      set({ navCollapsed: next });
    },

    setSlateCap: (cap) => {
      const next = clampSlateCap(cap);
      prefs.writeSlateCap(next);
      set({ slateCap: next });
    },

    navigate: (screen, goalId = null) => set({ route: { screen, goalId } }),

    openTaskDetail: (id) => set({ detailTaskId: id }),
    closeTaskDetail: () => set({ detailTaskId: null }),

    openPalette: () => set({ paletteOpen: true }),
    closePalette: () => set({ paletteOpen: false }),

    selectNote: (id) => set({ selectedNoteId: id }),

    toggleScratch: () => set((s) => ({ scratchOpen: !s.scratchOpen })),
    closeScratch: () => set({ scratchOpen: false }),

    openSettings: () => set({ settingsOpen: true }),

    // Like t3code: once an update is found it downloads by itself; the nav rail
    // then offers "Restart to update". A failed check or download is silent.
    checkForUpdate: async () => {
      if (get().update) return;
      try {
        const found = await ipc.checkForUpdate();
        if (!found) return;
        set({ update: { version: found.version, phase: "downloading" } });
        await found.install();
        set({ update: { version: found.version, phase: "ready" } });
      } catch (err) {
        console.error("update check failed", err);
        set({ update: null });
      }
    },
    restartToUpdate: () => ipc.relaunchApp(),
    closeSettings: () => set({ settingsOpen: false }),
    toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),

    /* ---------------------------------------------------------- task actions */

    addTask: async (input) => {
      const created = await withSaveGuard(() => ipc.createTask(input));
      // Every add path (quick-add, palette, goal page) lands in the new task's detail panel.
      set((s) => ({ tasks: [...s.tasks, created], detailTaskId: created.id }));
      return created;
    },

    toggleTaskStatus: async (id) => {
      // Send the full task with the new status; Rust applies the completed rule.
      await mutateTask(id, (t) => ({ ...t, status: t.status === "done" ? "open" : "done" }));
    },

    setTaskStatus: async (id, status) => {
      await mutateTask(id, (t) => ({ ...t, status }));
    },

    patchTask: async (id, patch) => {
      await mutateTask(id, (t) => ({ ...t, ...(typeof patch === "function" ? patch(t) : patch) }));
    },

    toggleTaskPriority: async (id) => {
      await mutateTask(id, (t) => ({ ...t, priority: !t.priority }));
    },

    toggleTaskCommit: async (id) => {
      let rejected = false;
      const result = await mutateTask(id, (current) => {
        // Evaluated against the LATEST tasks/cap at execution time, inside the
        // serialized mutation — never a snapshot read before an earlier await.
        const outcome = commitTransition(current, get().tasks, get().slateCap, localToday());
        if ("rejected" in outcome) {
          rejected = true;
          return null; // full — no ipc call, no state change
        }
        return outcome.task;
      });
      return !rejected && result !== undefined;
    },

    deleteTask: async (id) => {
      await withSaveGuard(() => ipc.deleteTask(id));
      set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== id),
        detailTaskId: s.detailTaskId === id ? null : s.detailTaskId,
      }));
    },

    attachFilesToTask: async (id, paths) => {
      const created = await withSaveGuard(() => ipc.attachFiles(id, paths));
      await mutateTask(id, (t) => ({ ...t, attachments: [...t.attachments, ...created] }));
    },

    attachPastedToTask: async (id, files, onFileError) => {
      // One at a time, in order: each append reads the latest attachments
      // (via mutateTask), so a multi-file paste can't drop an earlier file.
      for (const file of files) {
        try {
          const bytes = await fileBytes(file);
          const created = await withSaveGuard(() => ipc.attachBytes(id, pastedFileName(file), bytes));
          await mutateTask(id, (t) => ({ ...t, attachments: [...t.attachments, created] }));
        } catch (err) {
          onFileError(err);
        }
      }
    },

    removeTaskAttachment: async (id, path) => {
      await withSaveGuard(() => ipc.removeAttachment(path));
      await mutateTask(id, (t) => ({ ...t, attachments: t.attachments.filter((a) => a.path !== path) }));
    },

    /* ---------------------------------------------------------- note actions */

    addNote: async (input) => {
      const created = await withSaveGuard(() => ipc.createNote(input));
      set((s) => ({ notes: [...s.notes, created] }));
      return created;
    },

    saveNote: async (note, body) => {
      // A notebook/goal only holds notes of its own context; if an edit (e.g. a
      // context switch) left the note pointing at a notebook or goal it can no
      // longer belong to, unfile/unlink it before persisting (ADR-0008 / ADR-0003).
      const reconciled = reconcileNoteGoal(
        reconcileNoteNotebook(note, get().notebooks),
        get().goals,
      );
      const updated = await withSaveGuard(() => ipc.updateNote(reconciled, body));
      set((s) => ({ notes: s.notes.map((n) => (n.id === updated.id ? updated : n)) }));
    },

    getNoteBody: async (id) => ipc.loadNoteBody(id),

    deleteNote: async (id) => {
      await withSaveGuard(() => ipc.deleteNote(id));
      set((s) => ({
        notes: s.notes.filter((n) => n.id !== id),
        selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
      }));
    },

    moveNoteToNotebook: async (id, notebookId) => {
      const updated = await withSaveGuard(() => ipc.moveNote(id, notebookId));
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }));
    },

    /* ------------------------------------------------------ notebook actions */

    addNotebook: async (input) => {
      const created = await withSaveGuard(() => ipc.createNotebook(input));
      set((s) => ({ notebooks: [...s.notebooks, created] }));
      return created;
    },

    renameNotebook: async (id, name) => {
      await mutateNotebook(id, (n) => ({ ...n, name }));
    },

    deleteNotebook: async (id) => {
      const result = await withSaveGuard(() => ipc.deleteNotebook(id));
      const cleared = new Set(result.clearedNoteIds);
      set((s) => ({
        // Mirror the backend cleanup (ADR-0008): the notebook's notes survive,
        // their notebookId rewritten to null on disk — they become Unfiled.
        notebooks: s.notebooks.filter((n) => n.id !== id),
        notes: s.notes.map((n) => (cleared.has(n.id) ? { ...n, notebookId: null } : n)),
      }));
    },

    /* ---------------------------------------------------------- goal actions */

    addGoal: async (input) => {
      const created = await withSaveGuard(() => ipc.createGoal(input));
      set((s) => ({ goals: [...s.goals, created] }));
      return created;
    },

    saveGoal: async (goal) => {
      const updated = await withSaveGuard(() => ipc.updateGoal(goal));
      set((s) => ({ goals: s.goals.map((g) => (g.id === updated.id ? updated : g)) }));
    },

    deleteGoal: async (id) => {
      const result = await withSaveGuard(() => ipc.deleteGoal(id));
      const clearedTasks = new Set(result.clearedTaskIds);
      const clearedNotes = new Set(result.clearedNoteIds);
      set((s) => ({
        goals: s.goals.filter((g) => g.id !== id),
        // Mirror Rust's referential-integrity cleanup (ADR-0003): the deleted
        // goal's linked tasks/notes have had goalId rewritten to null on disk.
        tasks: s.tasks.map((t) => (clearedTasks.has(t.id) ? { ...t, goalId: null } : t)),
        notes: s.notes.map((n) => (clearedNotes.has(n.id) ? { ...n, goalId: null } : n)),
        route:
          s.route.screen === "goal" && s.route.goalId === id
            ? { screen: "goals", goalId: null }
            : s.route,
      }));
    },

    /* ------------------------------------------------------- IO passthroughs */

    attachPastedFile: async (entityId, file) => {
      const bytes = await fileBytes(file);
      return withSaveGuard(() => ipc.attachBytes(entityId, pastedFileName(file), bytes));
    },

    attachPickedFiles: (entityId, paths) => withSaveGuard(() => ipc.attachFiles(entityId, paths)),

    trashAttachment: async (path) => {
      await withSaveGuard(() => ipc.removeAttachment(path));
    },

    openAttachment: async (path) => {
      await ipc.openAttachment(path);
    },

    searchNoteBodies: async (query) => ipc.searchNoteBodies(query),
  };
});
