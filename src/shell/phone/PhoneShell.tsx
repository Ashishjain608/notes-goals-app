/**
 * PhoneShell — the phone's app frame (ADR-0012), rendered by App.tsx instead
 * of the desktop TitleBar/NavRail/BottomBar tree when `useIsPhone()`.
 *
 * The routed view fills the screen and scrolls under floating chrome: a glass
 * tab bar with search beside it, and the add button. Everything else is an
 * overlay above it: the FAB menu, the More sheet, search, the undo toast.
 * Each page-like state (task detail, an open note, a goal page, Activity,
 * Settings) holds a history entry, so iOS swipe-back closes it.
 */
import { useState, type JSX, type ReactNode } from "react";
import { useStore, type ComposerMode, type Screen } from "@/store";
import { ContextAvatar } from "@/components";
import type { Context } from "@/types";
import { useKeyboardInset } from "@/lib/keyboard";
import { usePhoneLayer } from "@/lib/phoneHistory";
import { NewGoalDialog } from "@/views/Goals/NewGoalDialog";
import { GlassTabBar } from "./GlassTabBar";
import { Fab } from "./Fab";
import { MoreSheet } from "./MoreSheet";
import { SearchOverlay } from "./SearchOverlay";
import { UndoToast } from "./UndoToast";

/**
 * Screens whose phone view draws its own PhoneHeader (title + context avatar).
 * The rest get a bare avatar row on top until they have a phone view.
 */
const OWN_HEADER = new Set<Screen>([]);

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
  const keyboard = useKeyboardInset();
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  usePageLayers();

  // The chrome steps aside while writing (a note open, search up, any keyboard).
  const editingNote = screen === "notes" && selectedNoteId !== null;
  const chrome = !editingNote && !paletteOpen && keyboard === 0;

  const onPick = async (mode: ComposerMode): Promise<void> => {
    const { navigate, addNote, selectNote } = useStore.getState();
    const context: Context = contextFilter === "all" ? "personal" : contextFilter;
    if (mode === "goal") {
      setNewGoalOpen(true);
    } else if (mode === "task") {
      navigate("today");
      // ponytail: focuses Today's quick-add until the composer (Phase 2) replaces it.
      setTimeout(() => document.querySelector<HTMLInputElement>("main input")?.focus(), 50);
    } else {
      navigate("notes");
      const created = await addNote({ title: "Untitled", context, body: mode === "checklist" ? "- [ ] " : "" });
      selectNote(created.id);
    }
  };

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
          <Fab onPick={(mode) => void onPick(mode)} />
          <GlassTabBar />
        </>
      )}
      <MoreSheet />
      <SearchOverlay />
      <UndoToast />
      <NewGoalDialog open={newGoalOpen} onClose={() => setNewGoalOpen(false)} />
    </div>
  );
}
