/**
 * The ONLY door the frontend uses to reach storage (docs/adr/0006, 0011).
 * Inside the Mac app every call goes to Rust through Tauri (backend/tauri.ts);
 * in a browser (the phone app) the same calls run against IndexedDB
 * (backend/web.ts). Both modules must export exactly the same names and
 * signatures — `Backend` below makes the compiler enforce that.
 */

import { isTauri } from "@/lib/platform";
import * as tauri from "@/lib/backend/tauri";
import * as web from "@/lib/backend/web";

export type { AvailableUpdate } from "@/lib/backend/tauri";

type Backend = typeof tauri;
const impl: Backend = isTauri ? tauri : (web satisfies Backend);

export const getVaultPath = impl.getVaultPath;
export const getConfiguredVaultPath = impl.getConfiguredVaultPath;
export const chooseVault = impl.chooseVault;
export const relocateVault = impl.relocateVault;
export const loadAll = impl.loadAll;
export const loadNoteBody = impl.loadNoteBody;
export const searchNoteBodies = impl.searchNoteBodies;
export const createTask = impl.createTask;
export const updateTask = impl.updateTask;
export const deleteTask = impl.deleteTask;
export const createNote = impl.createNote;
export const updateNote = impl.updateNote;
export const deleteNote = impl.deleteNote;
export const setNotePinned = impl.setNotePinned;
export const moveNote = impl.moveNote;
export const createNotebook = impl.createNotebook;
export const updateNotebook = impl.updateNotebook;
export const deleteNotebook = impl.deleteNotebook;
export const createGoal = impl.createGoal;
export const updateGoal = impl.updateGoal;
export const deleteGoal = impl.deleteGoal;
export const attachFiles = impl.attachFiles;
export const attachBytes = impl.attachBytes;
export const removeAttachment = impl.removeAttachment;
export const openAttachment = impl.openAttachment;
export const checkForUpdate = impl.checkForUpdate;
export const relaunchApp = impl.relaunchApp;
