/**
 * BottomSheet — phone modal sheet anchored to the bottom (ADR-0012).
 * Store-free: stays mounted through the slide-out, closes on Escape, and
 * lifts above the on-screen keyboard via `bottomInset`.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Slightly longer than the slide-out animation (200ms) so the sheet unmounts after it finishes. */
export const BOTTOM_SHEET_EXIT_MS = 260;

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name; also shown at the top-left of the header row when `showTitle` (default true). */
  title: string;
  showTitle?: boolean;
  /** Right-hand header button label; default "Done". */
  doneLabel?: string;
  /** Px the on-screen keyboard covers (from useKeyboardInset); lifts the sheet above it. Default 0. */
  bottomInset?: number;
  children: ReactNode;
}

export function BottomSheet({
  open,
  onClose,
  title,
  showTitle = true,
  doneLabel = "Done",
  bottomInset = 0,
  children,
}: BottomSheetProps): JSX.Element | null {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    setClosing(true);
    const timer = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, BOTTOM_SHEET_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Land screen-reader focus in the dialog when it opens.
  useEffect(() => {
    if (open && mounted) dialogRef.current?.focus({ preventScroll: true });
  }, [open, mounted]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 h-full w-full cursor-default bg-scrim ${
          closing ? "ng-overlay-out" : "ng-overlay-in"
        }`}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          bottom: bottomInset,
          padding: `0 16px ${bottomInset > 0 ? "16px" : "calc(16px + env(safe-area-inset-bottom))"}`,
        }}
        className={`absolute left-0 right-0 flex max-h-[calc(100dvh-48px)] flex-col rounded-t-[24px] bg-glass-strong outline-none backdrop-blur-[20px] ${
          closing ? "ng-sheet-out" : "ng-sheet-in"
        }`}
      >
        <div aria-hidden="true" className="mx-auto mt-[6px] h-[5px] w-9 shrink-0 rounded-full bg-line-2" />
        <div className="flex h-11 shrink-0 items-center justify-between">
          {showTitle ? (
            <span className="text-[13px] font-medium text-ink-2">{title}</span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 min-h-[44px] min-w-[44px] px-2 text-[17px] font-semibold text-accent-ink"
          >
            {doneLabel}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
