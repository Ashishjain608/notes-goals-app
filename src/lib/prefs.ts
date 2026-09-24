/**
 * prefs.ts — typed per-Mac preferences (theme, sidebar-collapsed state, slate
 * cap), read/written over an injectable storage contract (mirrors
 * `src/shell/scratchTabs.ts`'s `ScratchStorage`). Defaults to
 * `globalThis.localStorage`, resolved lazily — never cached at module load —
 * and every access is wrapped in try/catch, since storage can be absent or
 * throw (privacy mode, tests, a non-browser context).
 *
 * Keys and encodings are unchanged from the readers this replaces in
 * store.ts, so values already saved on a user's Mac keep loading.
 */

import { clampSlateCap, DEFAULT_SLATE_CAP } from "@/store/slate";

/** Minimal storage contract — matches the slice of window.localStorage we use. */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `globalThis.localStorage`, resolved fresh on every call (never cached). */
function defaultStorage(): PrefsStorage | undefined {
  return (globalThis as { localStorage?: PrefsStorage }).localStorage;
}

/** Safe read: returns `fallback` when storage is absent, throws, or has no value. */
export function readJson<T>(key: string, fallback: T, storage: PrefsStorage | undefined = defaultStorage()): T {
  try {
    const raw = storage?.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Safe write: silently does nothing when storage is absent or throws. */
export function writeJson(key: string, value: unknown, storage: PrefsStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // ignore: storage may be unavailable
  }
}

/* ------------------------------------------------------------------ theme */

const THEME_KEY = "ng-theme";

/** Read the persisted theme, defaulting to light. Safe when localStorage is absent. */
export function readTheme(storage: PrefsStorage | undefined = defaultStorage()): "light" | "dark" {
  try {
    return storage?.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Persist the theme. Safe when localStorage is absent. */
export function writeTheme(theme: "light" | "dark", storage: PrefsStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // ignore: storage may be unavailable
  }
}

/* -------------------------------------------------------------------- nav */

const NAV_KEY = "ng-nav-collapsed";

/** Read the persisted sidebar-collapsed state. Safe when localStorage is absent. */
export function readNavCollapsed(storage: PrefsStorage | undefined = defaultStorage()): boolean {
  try {
    return storage?.getItem(NAV_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the sidebar-collapsed state. Safe when localStorage is absent. */
export function writeNavCollapsed(collapsed: boolean, storage: PrefsStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(NAV_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore: storage may be unavailable
  }
}

/* ------------------------------------------------------------- slate cap */

const SLATE_CAP_KEY = "ng-slate-cap";

/** Read the persisted slate cap, defaulting to 5, clamped to 1–10. Safe when localStorage is absent. */
export function readSlateCap(storage: PrefsStorage | undefined = defaultStorage()): number {
  try {
    const raw = storage?.getItem(SLATE_CAP_KEY);
    return raw == null ? DEFAULT_SLATE_CAP : clampSlateCap(Number(raw));
  } catch {
    return DEFAULT_SLATE_CAP;
  }
}

/** Persist the slate cap, clamped to 1–10. Safe when localStorage is absent. */
export function writeSlateCap(cap: number, storage: PrefsStorage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(SLATE_CAP_KEY, String(clampSlateCap(cap)));
  } catch {
    // ignore: storage may be unavailable
  }
}
