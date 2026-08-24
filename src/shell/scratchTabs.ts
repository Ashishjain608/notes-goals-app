/**
 * scratchTabs — pure state, persistence, and migration logic for the
 * scratchpad's tabs. Deliberately dependency-free (no React, no direct
 * localStorage calls) so it is unit-testable in a plain Node environment:
 * callers inject a storage-like object and own all side effects (confirm
 * dialogs, focus, DOM). `Scratchpad.tsx` is a thin shell over this module.
 */

/** One tab: its text and an optional user-given name. */
export interface ScratchTab {
  id: string;
  text: string;
  /** Explicit user-given name; null means the title auto-derives from `text`. */
  manualTitle: string | null;
}

/** The full persisted shape: every tab plus which one is active. */
export interface ScratchState {
  tabs: ScratchTab[];
  activeId: string;
}

/** Minimal storage contract — matches the slice of window.localStorage we use. */
export interface ScratchStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The pre-tabs single-blob key; read once for migration, then left alone. */
export const LEGACY_TEXT_KEY = "ng-scratch";
/** Where the tabbed state lives once migrated (or created fresh). */
export const STATE_KEY = "ng-scratch-tabs";

const UNTITLED = "Untitled";
const TITLE_MAX = 40;

let idCounter = 0;
/** A unique-enough id for a tab; no crypto dependency needed for a local UI list. */
function makeId(): string {
  idCounter += 1;
  return `t${Date.now().toString(36)}${idCounter}`;
}

/** A single fresh, empty tab. */
function emptyTab(): ScratchTab {
  return { id: makeId(), text: "", manualTitle: null };
}

/** The default state: one empty tab. */
export function initialState(): ScratchState {
  const tab = emptyTab();
  return { tabs: [tab], activeId: tab.id };
}

/** Derive a tab's display title: its manual name if set, else its first non-empty line. */
export function tabTitle(tab: ScratchTab): string {
  if (tab.manualTitle) return tab.manualTitle;
  const line = tab.text.split("\n").find((l) => l.trim().length > 0)?.trim();
  if (!line) return UNTITLED;
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}

/** Build the migrated state from legacy single-blob scratch text. */
function migrateLegacy(text: string): ScratchState {
  const tab: ScratchTab = { id: makeId(), text, manualTitle: null };
  return { tabs: [tab], activeId: tab.id };
}

/** Type-guard a parsed JSON value into a ScratchState, rejecting anything malformed. */
function isValidState(value: unknown): value is ScratchState {
  if (!value || typeof value !== "object") return false;
  const v = value as { activeId?: unknown; tabs?: unknown };
  if (typeof v.activeId !== "string" || !Array.isArray(v.tabs) || v.tabs.length === 0) return false;
  return v.tabs.every((t) => {
    if (!t || typeof t !== "object") return false;
    const tab = t as { id?: unknown; text?: unknown; manualTitle?: unknown };
    return (
      typeof tab.id === "string" &&
      typeof tab.text === "string" &&
      (tab.manualTitle === null || typeof tab.manualTitle === "string")
    );
  });
}

/**
 * Load persisted tab state. Prefers the tabbed key; if absent or corrupt,
 * migrates the legacy single-blob key (if any) and persists the result so
 * the migration never runs again on subsequent loads.
 */
export function loadState(storage: ScratchStorage): ScratchState {
  try {
    const raw = storage.getItem(STATE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidState(parsed)) return parsed;
    }
  } catch {
    // fall through to legacy/default
  }

  let state: ScratchState;
  try {
    const legacy = storage.getItem(LEGACY_TEXT_KEY);
    state = legacy ? migrateLegacy(legacy) : initialState();
  } catch {
    state = initialState();
  }
  saveState(storage, state);
  return state;
}

/** Persist tab state; storage errors are swallowed (device-local, best-effort). */
export function saveState(storage: ScratchStorage, state: ScratchState): void {
  try {
    storage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // storage may be unavailable; the pad still works for this session
  }
}

/** Add a new empty tab and make it active. */
export function addTab(state: ScratchState): ScratchState {
  const tab = emptyTab();
  return { tabs: [...state.tabs, tab], activeId: tab.id };
}

/** Close a tab; if it was the last one, replace it with a fresh empty tab. */
export function closeTab(state: ScratchState, id: string): ScratchState {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return state;

  const remaining = state.tabs.filter((t) => t.id !== id);
  if (remaining.length === 0) {
    const tab = emptyTab();
    return { tabs: [tab], activeId: tab.id };
  }

  if (state.activeId !== id) return { tabs: remaining, activeId: state.activeId };
  const next = remaining[Math.min(idx, remaining.length - 1)] ?? remaining[0];
  return { tabs: remaining, activeId: next!.id };
}

/** Switch the active tab (a no-op if the id is unknown). */
export function switchTab(state: ScratchState, id: string): ScratchState {
  if (!state.tabs.some((t) => t.id === id)) return state;
  return { ...state, activeId: id };
}

/** Set a manual, sticky title for a tab; a blank name clears it back to auto-title. */
export function renameTab(state: ScratchState, id: string, name: string): ScratchState {
  const trimmed = name.trim();
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, manualTitle: trimmed || null } : t)),
  };
}

/** Update a tab's text. */
export function setTabText(state: ScratchState, id: string, text: string): ScratchState {
  return { ...state, tabs: state.tabs.map((t) => (t.id === id ? { ...t, text } : t)) };
}

/** The currently active tab, falling back to the first tab if activeId is stale. */
export function activeTab(state: ScratchState): ScratchTab {
  return state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0]!;
}

/** Switch to the tab after the active one, wrapping from the last back to the first. */
export function nextTab(state: ScratchState): ScratchState {
  const idx = state.tabs.findIndex((t) => t.id === state.activeId);
  if (idx === -1) return state;
  return switchTab(state, state.tabs[(idx + 1) % state.tabs.length]!.id);
}

/** Switch to the tab before the active one, wrapping from the first back to the last. */
export function prevTab(state: ScratchState): ScratchState {
  const idx = state.tabs.findIndex((t) => t.id === state.activeId);
  if (idx === -1) return state;
  return switchTab(state, state.tabs[(idx - 1 + state.tabs.length) % state.tabs.length]!.id);
}

/**
 * Switch to the nth tab (1-based), following the macOS convention that ⌘9
 * always jumps to the last tab regardless of how many there are. An
 * out-of-range n (below 9) is a no-op.
 */
export function nthTab(state: ScratchState, n: number): ScratchState {
  if (n >= 9) return switchTab(state, state.tabs[state.tabs.length - 1]!.id);
  const target = state.tabs[n - 1];
  return target ? switchTab(state, target.id) : state;
}
