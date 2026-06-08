/**
 * useIsFullscreen — tracks whether the Tauri window is in native (macOS) full
 * screen.
 *
 * In full screen macOS hides the traffic-light buttons, so the title bar no
 * longer needs to reserve space for them on the left. The window emits a resize
 * when entering/leaving full screen, which we use to re-query the state. Safe
 * outside Tauri (e.g. a plain `vite` browser) — it just stays `false`.
 */
import { useEffect, useState } from "react";

export function useIsFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const sync = async (): Promise<void> => {
          try {
            const value = await win.isFullscreen();
            if (active) setFullscreen(value);
          } catch {
            /* ignore transient query errors */
          }
        };
        await sync();
        const stop = await win.onResized(() => void sync());
        if (active) unlisten = stop;
        else stop();
      } catch {
        /* not running under Tauri — leave as not full screen */
      }
    })();

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return fullscreen;
}
