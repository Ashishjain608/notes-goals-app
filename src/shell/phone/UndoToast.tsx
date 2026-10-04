/**
 * UndoToast — the phone's "Undo" pill, floating above the FAB while the
 * store holds an undo action.
 */
import type { JSX } from "react";
import { useStore } from "@/store";

export function UndoToast(): JSX.Element | null {
  const toast = useStore((s) => s.undoToast);
  const runUndo = useStore((s) => s.runUndo);
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="ng-overlay-in fixed left-4 right-4 z-[55] flex min-h-[52px] items-center justify-between gap-3 rounded-2xl bg-ink px-4 text-[15px] text-bg shadow"
      style={{ bottom: "calc(max(12px, env(safe-area-inset-bottom)) + 136px)" }}
    >
      <span className="min-w-0">{toast.label}</span>
      {toast.run && (
        <button
          type="button"
          onClick={() => void runUndo()}
          className="min-h-[44px] min-w-[44px] text-[15px] font-bold text-[#a3adff] [[data-theme=spectrum-dark]_&]:text-[#4038c4]"
        >
          Undo
        </button>
      )}
    </div>
  );
}
