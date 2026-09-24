/**
 * App shell — assembled during integration (Wave 3).
 *
 * Boots the store, gates on vault status, and lays out the chosen design:
 * left nav rail + top chrome + the routed view, with the command palette and
 * task detail panel mounted as self-gating overlays. Handles the global ⌘K
 * shortcut and a guarded reload-on-window-focus (docs/adr/0004/0006).
 */
import { useEffect } from "react";
import { useStore } from "@/store";

// Same cadence as t3code: first check shortly after launch, then keep polling.
const UPDATE_STARTUP_DELAY_MS = 15_000;
const UPDATE_POLL_INTERVAL_MS = 4 * 60_000;

// How often to re-check the local calendar day, so Today/the slate notice
// midnight even when nothing else changes the store.
const DAY_POLL_INTERVAL_MS = 60_000;
import { NavRail } from "@/shell/NavRail";
import { TitleBar } from "@/shell/TitleBar";
import { SidebarToggle } from "@/shell/SidebarToggle";
import { Scratchpad } from "@/shell/Scratchpad";
import { Settings } from "@/shell/Settings";
import { VaultGate } from "@/shell/VaultGate";
import { CommandPalette, TaskDetail } from "@/views/Capture";
import Today from "@/views/Today";
import Backlog from "@/views/Backlog";
import Notes from "@/views/Notes";
import GoalsOverview from "@/views/Goals";
import GoalPage from "@/views/Goals/GoalPage";
import Activity from "@/views/Activity";

function CurrentView(): JSX.Element {
  const screen = useStore((s) => s.route.screen);
  const goalId = useStore((s) => s.route.goalId);
  switch (screen) {
    case "tasks":
      return <Backlog />;
    case "notes":
      return <Notes />;
    case "activity":
      return <Activity />;
    case "goals":
      return <GoalsOverview />;
    case "goal":
      return goalId ? <GoalPage goalId={goalId} /> : <GoalsOverview />;
    case "today":
    default:
      return <Today />;
  }
}

export default function App(): JSX.Element {
  const status = useStore((s) => s.status);
  const init = useStore((s) => s.init);
  const reload = useStore((s) => s.reload);
  const navCollapsed = useStore((s) => s.navCollapsed);
  const toggleNav = useStore((s) => s.toggleNav);
  const checkForUpdate = useStore((s) => s.checkForUpdate);
  const refreshDay = useStore((s) => s.refreshDay);

  // Boot: load config + vault + data.
  useEffect(() => {
    void init();
  }, [init]);

  // Midnight correctness: re-check the local day on a slow poll and whenever
  // the window regains focus (the common case — the app was just sitting in
  // the background overnight).
  useEffect(() => {
    refreshDay();
    const poll = setInterval(refreshDay, DAY_POLL_INTERVAL_MS);
    window.addEventListener("focus", refreshDay);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", refreshDay);
    };
  }, [refreshDay]);

  // Auto-update: look for a newer release and download it in the background.
  useEffect(() => {
    const first = setTimeout(() => void checkForUpdate(), UPDATE_STARTUP_DELAY_MS);
    const poll = setInterval(() => void checkForUpdate(), UPDATE_POLL_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [checkForUpdate]);

  // Global ⌘K (or Ctrl+K) opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useStore.getState().openPalette();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        useStore.getState().toggleScratch();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        useStore.getState().toggleSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Catch external edits cheaply: reload on focus (store guards in-flight saves).
  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  if (status !== "ready") return <VaultGate />;

  return (
    <div className="flex h-screen flex-col bg-bg text-ink">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <NavRail expanded={!navCollapsed} />
        <SidebarToggle collapsed={navCollapsed} onToggle={toggleNav} />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <CurrentView />
          </div>
        </main>
      </div>
      <CommandPalette />
      <TaskDetail />
      <Scratchpad />
      <Settings />
    </div>
  );
}
