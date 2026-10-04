/**
 * Fab — the phone's add button. Tapping opens a scrim + a thumb-reachable menu
 * of Goal / Checklist / Note / Task pills; picking one hands the mode to
 * `onPick` (the shell opens the composer). Open state lives in the store's
 * phoneOverlay so other layers can close it.
 */
import { useEffect, type JSX } from "react";
import { Icon } from "@/components";
import { useStore, type ComposerMode } from "@/store";
import { usePhoneLayer } from "@/lib/phoneHistory";

const BASE = "max(12px, env(safe-area-inset-bottom))";
const ICON_INK = "text-white [[data-theme=spectrum-dark]_&]:text-bg";
const PILL_SHADOW = "shadow-[0_1px_2px_rgba(40,40,90,.08),0_12px_28px_-14px_rgba(20,18,15,.35)]";

function ChecklistIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4" width="5" height="5" rx="1.2" />
      <rect x="3.5" y="14" width="5" height="5" rx="1.2" />
      <path d="M12 6.5h8.5M12 16.5h8.5" />
    </svg>
  );
}

// Top → bottom; Task last so it sits nearest the thumb.
const ITEMS: { mode: ComposerMode; label: string }[] = [
  { mode: "goal", label: "Goal" },
  { mode: "checklist", label: "Checklist" },
  { mode: "note", label: "Note" },
  { mode: "task", label: "Task" },
];

export function Fab({ onPick }: { onPick: (mode: ComposerMode) => void }): JSX.Element {
  const open = useStore((s) => s.phoneOverlay?.kind === "menu");
  const setPhoneOverlay = useStore((s) => s.setPhoneOverlay);
  const close = () => setPhoneOverlay(null);
  usePhoneLayer("fab-menu", open, close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPhoneOverlay(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setPhoneOverlay]);

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Add"
        aria-haspopup="menu"
        aria-expanded={false}
        onClick={() => setPhoneOverlay({ kind: "menu" })}
        className={`fixed right-4 z-[32] flex h-[60px] w-[60px] items-center justify-center rounded-[18px] bg-accent shadow-fab ${ICON_INK}`}
        style={{ bottom: `calc(${BASE} + 66px)` }}
      >
        <Icon name="plus" size={26} />
      </button>
    );
  }

  return (
    <>
      <div className="ng-overlay-in fixed inset-0 z-50 bg-scrim" onClick={close} aria-hidden="true" />
      <div
        role="menu"
        className="fixed right-4 z-50 flex flex-col items-end gap-2"
        style={{ bottom: `calc(${BASE} + 138px)` }}
      >
        {ITEMS.map(({ mode, label }, i) => {
          const primary = mode === "task";
          return (
            <button
              key={mode}
              type="button"
              role="menuitem"
              onClick={() => {
                setPhoneOverlay(null);
                onPick(mode);
              }}
              className={`animate-riseIn flex h-14 items-center gap-[10px] rounded-full pl-[18px] pr-6 text-[17px] font-semibold ${PILL_SHADOW} ${
                primary
                  ? "border-[1.5px] border-accent-line bg-menu-primary text-accent-ink"
                  : "bg-surface text-ink"
              }`}
              style={{ animationDelay: `${i * 30}ms`, animationFillMode: "both" }}
            >
              <span className="text-accent-ink">
                {mode === "checklist" ? <ChecklistIcon /> : <Icon name={mode === "task" ? "check" : mode === "note" ? "notes" : "goals"} size={22} />}
              </span>
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className={`fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent ${ICON_INK}`}
        style={{ right: 18, bottom: `calc(${BASE} + 68px)` }}
      >
        <Icon name="x" size={24} />
      </button>
    </>
  );
}
