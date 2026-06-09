/**
 * Typed wrappers over the Rust command layer (docs/adr/0006). This module is the
 * ONLY place the frontend talks to Tauri — the store calls these, never `invoke`
 * directly. Command names + argument keys here are the contract the Rust side
 * (src-tauri/src/commands.rs) must implement exactly.
 *
 * Tauri converts camelCase JS argument keys to snake_case Rust params.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  CreateGoalInput,
  CreateNoteInput,
  CreateNotebookInput,
  CreateTaskInput,
  Goal,
  GoalDeletionResult,
  Note,
  Notebook,
  NotebookDeletionResult,
  StoreSnapshot,
  Task,
} from "@/types";

/* -------------------------------------------------------------------- Vault */

/** Persisted vault path, or null if none chosen yet. */
export const getVaultPath = (): Promise<string | null> => invoke("get_vault_path");

/** Open the native folder picker, validate + initialize, persist. Returns chosen path or null if cancelled. */
export const chooseVault = (): Promise<string | null> => invoke("choose_vault");

/** Switch to a different existing vault folder. */
export const relocateVault = (path: string): Promise<void> => invoke("relocate_vault", { path });

/* --------------------------------------------------------------------- Load */

/** Read the whole vault into one typed graph (notes carry metadata only). */
export const loadAll = (): Promise<StoreSnapshot> => invoke("load_all");

/** Lazily read a single note's markdown body. */
export const loadNoteBody = (id: string): Promise<string> => invoke("load_note_body", { id });

/* -------------------------------------------------------------------- Tasks */

export const createTask = (input: CreateTaskInput): Promise<Task> => invoke("create_task", { input });
export const updateTask = (task: Task): Promise<Task> => invoke("update_task", { task });
export const deleteTask = (id: string): Promise<void> => invoke("delete_task", { id });

/* -------------------------------------------------------------------- Notes */

export const createNote = (input: CreateNoteInput): Promise<Note> => invoke("create_note", { input });
export const updateNote = (note: Note, body: string): Promise<Note> =>
  invoke("update_note", { note, body });
export const deleteNote = (id: string): Promise<void> => invoke("delete_note", { id });
/** File a note into a notebook (or null to unfile). Metadata-only; body preserved. */
export const moveNote = (id: string, notebookId: string | null): Promise<Note> =>
  invoke("move_note", { id, notebookId });

/* ---------------------------------------------------------------- Notebooks */

export const createNotebook = (input: CreateNotebookInput): Promise<Notebook> =>
  invoke("create_notebook", { input });
export const updateNotebook = (notebook: Notebook): Promise<Notebook> =>
  invoke("update_notebook", { notebook });
export const deleteNotebook = (id: string): Promise<NotebookDeletionResult> =>
  invoke("delete_notebook", { id });

/* -------------------------------------------------------------------- Goals */

export const createGoal = (input: CreateGoalInput): Promise<Goal> => invoke("create_goal", { input });
export const updateGoal = (goal: Goal): Promise<Goal> => invoke("update_goal", { goal });
export const deleteGoal = (id: string): Promise<GoalDeletionResult> => invoke("delete_goal", { id });
