import { useSyncExternalStore } from "react";

/** True inside the Mac app; false in a browser (the phone app, docs/adr/0011). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Below this width the phone layout applies. The Mac window's minimum (880) never reaches it. */
export const PHONE_MAX_WIDTH = 767;

const phoneQuery = `(max-width: ${PHONE_MAX_WIDTH}px)`;

/** True while the viewport is phone-sized; re-renders on rotation/resize. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(phoneQuery);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );
}
