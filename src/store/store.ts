/**
 * The in-memory store (Zustand) — one mirror of the loaded entity graph plus
 * the app's UI state. It is the only stateful layer; disk is the source of
 * truth and every mutating action persists through `@/lib/ipc` (await-then-
 * update, no optimistic UI — local writes are sub-ms per ADR-0006).
 *
 * Theme + vault are app config: theme is mirrored to localStorage; the vault
 * path is owned by Rust. `reload()` is the focus-reload; it is guarded by a
 * module-level `savePending` flag so a focus event never clobbers an in-flight
 * edit (docs/IMPLEMENTATION_PLAN.md §6).
 */

import { create } from "zustand";
import type {
  ContextFilter,
  CreateGoalInput,
  CreateNoteInput,
  CreateNotebookInput,
  CreateTaskInput,
  Goal,
  Note,
  Notebook,
  Task,
  TaskStatus,
} from "@/types";
import * as ipc from "@/lib/ipc";
import { localToday } from "@/lib/dates";
import { reconcileNoteGoal, reconcileNoteNotebook, selectSlate } from "./selectors";

export type AppStatus = "loading" | "needs-vault" | "ready" | "error";
export type Screen = "today" | "tasks" | "notes" | "goals" | "goal" | "activity";
export type Theme = "light" | "dark";

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
  route: { screen: Screen; goalId: string | null };
  detailTaskId: string | null;
  paletteOpen: boolean;
  selectedNoteId: string | null;
  scratchOpen: boolean;
  settingsOpen: boolean;

  // lifecycle
  init: () => Promise<void>;
  chooseVault: () => Promise<void>;
  relocateVault: (path: string) => Promise<void>;
  reload: () => Promise<void>;

  // ui actions
  setContextFilter: (c: ContextFilter) => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleNav: () => void;
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
  toggleSettings: () => void;

  // task actions
  addTask: (input: CreateTaskInput) => Promise<Task>;
  toggleTaskStatus: (id: string) => Promise<void>;
  setTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  patchTask: (
    id: string,
    patch: Partial<
      Pick<
        Task,
        "title" | "details" | "due" | "snoozeUntil" | "goalId" | "subtasks" | "priority" | "attachments"
      >
    >,
  ) => Promise<void>;
  toggleTaskPriority: (id: string) => Promise<void>;
  /**
   * Put a task on today's slate, or take it off. Resolves false when the slate
   * is already at SLATE_CAP — the caller shows why rather than silently doing
   * nothing.
   */
  toggleTaskCommit: (id: string) => Promise<boolean>;
  deleteTask: (id: string) => Promise<void>;

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
}

/* ------------------------------------------------------------- theme config */

const THEME_KEY = "ng-theme";

/** Read the persisted theme, defaulting to light. Safe when localStorage is absent. */
function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** The app's light/dark mode maps onto Spectrum's two `data-theme` values. */
const DOM_THEME: Record<Theme, string> = { light: "spectrum", dark: "spectrum-dark" };

/** Apply the theme to the document (the shell reads `data-theme`) + persist it. */
function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore: storage may be unavailable (e.g. tests / privacy mode)
  }
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.setAttribute("data-theme", DOM_THEME[theme]);
  }
}

/* ----------------------------------------------------------- nav config --- */

const NAV_KEY = "ng-nav-collapsed";

/** Read the persisted sidebar-collapsed state. Safe when localStorage is absent. */
function readNavCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) === "1";
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------- save guard ---
   Module-level so a window-focus reload can tell whether a mutation is mid-
   flight and skip itself rather than overwrite the optimistic local state. */

let savePending = false;

/** Run a mutating IPC call with the save guard raised for its full duration. */
async function withSaveGuard<T>(fn: () => Promise<T>): Promise<T> {
  savePending = true;
  try {
    return await fn();
  } finally {
    savePending = false;
  }
}

/* ---------------------------------------------------------------- the store */

export const useStore = create<AppState>((set, get) => ({
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
  navCollapsed: readNavCollapsed(),
  route: { screen: "today", goalId: null },
  detailTaskId: null,
  paletteOpen: false,
  selectedNoteId: null,
  scratchOpen: false,
  settingsOpen: false,

  /* ------------------------------------------------------------- lifecycle */

  init: async () => {
    const theme = readTheme();
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
    if (savePending) return; // an edit is mid-flight — don't clobber it
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
    try {
      localStorage.setItem(NAV_KEY, next ? "1" : "0");
    } catch {
      // ignore: storage may be unavailable
    }
    set({ navCollapsed: next });
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
  closeSettings: () => set({ settingsOpen: false }),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),

  /* ---------------------------------------------------------- task actions */

  addTask: async (input) => {
    const created = await withSaveGuard(() => ipc.createTask(input));
    set((s) => ({ tasks: [...s.tasks, created] }));
    return created;
  },

  toggleTaskStatus: async (id) => {
    const current = get().tasks.find((t) => t.id === id);
    if (!current) return;
    const nextStatus: TaskStatus = current.status === "done" ? "open" : "done";
    // Send the full task with the new status; Rust applies the completed rule.
    const updated = await withSaveGuard(() =>
      ipc.updateTask({ ...current, status: nextStatus }),
    );
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
  },

  setTaskStatus: async (id, status) => {
    const current = get().tasks.find((t) => t.id === id);
    if (!current) return;
    const updated = await withSaveGuard(() => ipc.updateTask({ ...current, status }));
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
  },

  patchTask: async (id, patch) => {
    const current = get().tasks.find((t) => t.id === id);
    if (!current) return;
    const merged: Task = { ...current, ...patch };
    const updated = await withSaveGuard(() => ipc.updateTask(merged));
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
  },

  toggleTaskPriority: async (id) => {
    const current = get().tasks.find((t) => t.id === id);
    if (!current) return;
    const updated = await withSaveGuard(() =>
      ipc.updateTask({ ...current, priority: !current.priority }),
    );
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
  },

  toggleTaskCommit: async (id) => {
    const current = get().tasks.find((t) => t.id === id);
    if (!current) return false;

    const today = localToday();
    const onSlate = current.committedOn === today;
    if (!onSlate && selectSlate(get().tasks).full) return false;

    // Re-committing something you promised on an earlier day and didn't finish
    // is what `carried` counts — the honest record, not a punishment.
    const carriedForward =
      !onSlate && current.committedOn != null && current.committedOn < today;

    const updated = await withSaveGuard(() =>
      ipc.updateTask({
        ...current,
        committedOn: onSlate ? null : today,
        carried: carriedForward ? current.carried + 1 : current.carried,
      }),
    );
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? updated : t)) }));
    return true;
  },

  deleteTask: async (id) => {
    await withSaveGuard(() => ipc.deleteTask(id));
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      detailTaskId: s.detailTaskId === id ? null : s.detailTaskId,
    }));
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
    const current = get().notebooks.find((n) => n.id === id);
    if (!current) return;
    const updated = await withSaveGuard(() => ipc.updateNotebook({ ...current, name }));
    set((s) => ({ notebooks: s.notebooks.map((n) => (n.id === id ? updated : n)) }));
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
}));

/** Coerce an unknown thrown value into a human-readable message. */
function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}
