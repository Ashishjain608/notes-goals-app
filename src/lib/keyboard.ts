/**
 * The on-screen keyboard on the phone (ADR-0012). iOS overlays the keyboard on
 * the layout viewport instead of resizing it, so `position: fixed; bottom: 0`
 * UI ends up behind it. `visualViewport` shrinks (and may scroll) instead:
 * the keyboard covers whatever of the layout viewport lies below the visual
 * one. Bottom-anchored phone UI (composer, search field, format pill, sheets)
 * sets `bottom: inset` from `useKeyboardInset()`.
 */
import { useEffect, useState } from "react";

export interface ViewportSample {
  /** `window.innerHeight`: the layout viewport. */
  innerHeight: number;
  /** `visualViewport.height`. */
  vvHeight: number;
  /** `visualViewport.offsetTop`: how far the visual viewport is scrolled down the layout one. */
  vvOffsetTop: number;
  /** An editable element has focus. With none, no keyboard can be up. */
  editing: boolean;
}

/** Below this, a gap is browser chrome or rounding, not a keyboard. */
const MIN_KEYBOARD_PX = 80;

/**
 * Px of the layout viewport the keyboard covers, measured from its bottom.
 * Not editing → 0: iOS standalone mode can leave the visual viewport shrunk
 * after the keyboard closes, and trusting it would float the UI mid-screen.
 */
export function keyboardInset({ innerHeight, vvHeight, vvOffsetTop, editing }: ViewportSample): number {
  if (!editing) return 0;
  const covered = Math.round(innerHeight - vvHeight - vvOffsetTop);
  return covered >= MIN_KEYBOARD_PX ? covered : 0;
}

/** True for elements that raise the keyboard: text inputs, textareas, contenteditable. */
export function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) {
    return !el.readOnly && !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(el.type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/** Wait after a blur before re-measuring: focus may just be moving to the next field. */
const BLUR_SETTLE_MS = 250;

/** Px the keyboard covers right now; 0 when it's down or there is no visualViewport. */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const measure = (): void => {
      setInset(
        keyboardInset({
          innerHeight: window.innerHeight,
          vvHeight: vv.height,
          vvOffsetTop: vv.offsetTop,
          editing: isEditable(document.activeElement),
        }),
      );
    };
    const onFocusOut = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        measure();
        // iOS standalone: focusing an input can scroll the (overflow:hidden)
        // page, and closing the keyboard doesn't scroll it back.
        if (!isEditable(document.activeElement) && window.scrollY !== 0) window.scrollTo(0, 0);
      }, BLUR_SETTLE_MS);
    };

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    window.addEventListener("focusin", measure);
    window.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(timer);
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      window.removeEventListener("focusin", measure);
      window.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return inset;
}
