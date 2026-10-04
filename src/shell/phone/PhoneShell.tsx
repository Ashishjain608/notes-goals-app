/**
 * PhoneShell — the phone's app frame (ADR-0012), rendered by App.tsx instead
 * of the desktop TitleBar/NavRail tree when `useIsPhone()`.
 *
 * The routed view fills the screen and scrolls under floating chrome: a glass
 * tab bar with search beside it, and the add button. Everything else is an
 * overlay above it: the FAB menu, the composer, the More sheet, search, the
 * undo toast.
 * Each page-like state (task detail, an open note, a goal page, Activity,
 * Settings) holds a history entry, so iOS swipe-back closes it.
 */
import type { JSX, ReactNode } from "react";
import { useStore, type Screen } from "@/store";
import { ContextAvatar } from "@/components";
import { useKeyboardInset } from "@/lib/keyboard";
import { usePhoneLayer } from "@/lib/phoneHistory";
import { GlassTabBar } from "./GlassTabBar";
import { Fab } from "./Fab";
import { Composer } from "./Composer";
import { MoreSheet } from "./MoreSheet";
import { SearchOverlay } from "./SearchOverlay";
import { UndoToast } from "./UndoToast";

/**
 * Screens that skip the shell's bare avatar row: those that draw their own
 * PhoneHeader, and the goal page (its Back row leads; More is a tab away).
 */
const OWN_HEADER = new Set<Screen>(["today", "tasks", "notes", "goals", "goal"]);

/** Register the page-like states with phone history so swipe-back closes them. */
function usePageLayers(): void {
  const screen = useStore((s) => s.route.screen);
  const detailTaskId = useStore((s) => s.detailTaskId);
  const selectedNoteId = useStore((s) => s.selectedNoteId);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const { navigate, closeTaskDetail, selectNote, closeSettings } = useStore.getState();

  usePhoneLayer("task", detailTaskId !== null, closeTaskDetail);
  usePhoneLayer("note", screen === "notes" && selectedNoteId !== null, () => selectNote(null));
  usePhoneLayer("goal-page", screen === "goal", () => navigate("goals"));
  usePhoneLayer("activity", screen === "activity", () => navigate("today"));
  usePhoneLayer("settings", settingsOpen, closeSettings);
}

export function PhoneShell({ children }: { children: ReactNode }): JSX.Element {
  const screen = useStore((s) => s.route.screen);
  const selectedNoteId = useStore((s) => s.selectedNoteId);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const contextFilter = useStore((s) => s.contextFilter);
  const composing = useStore((s) => s.phoneOverlay?.kind === "composer");
  const keyboard = useKeyboardInset();
  usePageLayers();

  // The chrome steps aside while writing (a note open, search up, the composer, any keyboard).
  const editingNote = screen === "notes" && selectedNoteId !== null;
  const chrome = !editingNote && !paletteOpen && !composing && keyboard === 0;

  return (
    <div className="ng-phone relative flex h-[100dvh] flex-col bg-bg text-ink">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
        {!OWN_HEADER.has(screen) && !editingNote && (
          <div className="flex shrink-0 justify-end px-3 pt-1">
            <ContextAvatar
              filter={contextFilter}
              onClick={() => useStore.getState().setPhoneOverlay({ kind: "more" })}
            />
          </div>
        )}
        <div className="min-h-0 flex-1">{children}</div>
      </main>
      {chrome && (
        <>
          <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[150px] bg-[image:var(--fade)]" />
          <Fab onPick={(mode) => useStore.getState().setPhoneOverlay({ kind: "composer", mode })} />
          <GlassTabBar />
        </>
      )}
      <MoreSheet />
      <SearchOverlay />
      <Composer />
      <UndoToast />
    </div>
  );
}
