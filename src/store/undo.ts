/**
 * The phone's Undo toast (ADR-0012): reversible actions act at once and offer
 * one Undo. A single pending toast; a new one replaces it; it expires after
 * UNDO_MS. The undo itself is a closure that writes the previous value back
 * through the normal store actions.
 */

export const UNDO_MS = 6000;

export interface UndoToast {
  /** Changes on every show, so a stale timer can't clear a newer toast. */
  id: number;
  label: string;
  /** Absent for an info-only toast (no Undo button). */
  run?: () => Promise<unknown> | void;
}

export interface UndoSlice {
  undoToast: UndoToast | null;
  showUndo: (toast: { label: string; undo?: () => Promise<unknown> | void }) => void;
  /** Run the pending undo (if any) and hide the toast. */
  runUndo: () => Promise<void>;
  dismissUndo: () => void;
}

type SetFn = (partial: { undoToast: UndoToast | null }) => void;
type GetFn = () => { undoToast: UndoToast | null };

export function createUndoSlice(set: SetFn, get: GetFn): UndoSlice {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  const hide = (): void => {
    clearTimeout(timer);
    timer = undefined;
    set({ undoToast: null });
  };

  return {
    undoToast: null,
    showUndo: ({ label, undo }) => {
      clearTimeout(timer);
      const id = ++seq;
      set({ undoToast: { id, label, run: undo } });
      timer = setTimeout(() => {
        if (get().undoToast?.id === id) set({ undoToast: null });
      }, UNDO_MS);
    },
    runUndo: async () => {
      const toast = get().undoToast;
      if (!toast) return;
      hide();
      await toast.run?.();
    },
    dismissUndo: hide,
  };
}
