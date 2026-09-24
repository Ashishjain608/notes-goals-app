/**
 * useSlidePanel — the lifecycle shared by the right-side slide-in surfaces
 * (the task detail panel and the goal note drawer): stay mounted through the
 * slide-out so closing animates, and close on Escape from anywhere.
 *
 * Escape listens on window so a click-away-then-Escape still works. The
 * command palette owns Escape while it's open, and surfaces layered above
 * (the scratchpad) stop the event before it reaches window.
 */
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store";

/** Slightly longer than the slide-out animation (0.24s) so the panel unmounts after it finishes. */
export const SLIDE_PANEL_EXIT_MS = 260;

export interface SlidePanelState {
  /** Render the panel at all (true while open and during the slide-out). */
  mounted: boolean;
  /** True during the slide-out: apply the exit animation. */
  closing: boolean;
}

/**
 * Drive a slide panel from its `open` flag. `onEscape` may change every render;
 * the latest one is called.
 */
export function useSlidePanel(open: boolean, onEscape: () => void): SlidePanelState {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

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
    }, SLIDE_PANEL_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || useStore.getState().paletteOpen) return;
      e.preventDefault();
      onEscapeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return { mounted, closing };
}
