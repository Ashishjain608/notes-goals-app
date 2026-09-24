/**
 * Scratchpad — a floating, draggable, resizable brain-dump pad with tabs.
 *
 * Deliberately NOT a Note or Task: the text lives only on this device
 * (localStorage), never in the portable vault, and it floats non-modally above
 * everything so it can be used while a task panel or any view is open — opening
 * or closing it affects no other app state. Toggled from the nav footer button
 * or ⌘J; position/size are remembered. Enter/exit use a soft scale-fade so the
 * close is animated (the panel stays mounted until the exit finishes).
 *
 * Tabs let the pad hold several independent scraps at once; all tab state
 * (text, names, ordering) lives in `scratchTabs.ts` as a plain serializable
 * object, migrated once from the pre-tabs single-blob format. This component
 * is a thin shell: it owns layout/drag/resize/animation and defers all tab
 * logic to that module.
 */
import { useEffect, useRef, useState, type JSX } from "react";
import { useStore } from "@/store";
import { Icon } from "@/components";
import {
  activeTab,
  addTab,
  closeTab,
  loadState,
  nextTab,
  nthTab,
  prevTab,
  renameTab,
  saveState,
  setTabText,
  switchTab,
  tabTitle,
  type ScratchState,
  type ScratchStorage,
} from "./scratchTabs";
import { confirmDestructive } from "@/lib/confirm";
import { readJson, writeJson } from "@/lib/prefs";

const RECT_KEY = "ng-scratch-rect";
const MIN_W = 280;
const MIN_H = 220;
const DEFAULT_W = 360;
const DEFAULT_H = 420;
const MARGIN = 24;
/** Slightly longer than the exit animation (0.15s) so it always completes. */
const EXIT_MS = 180;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function viewport(): { w: number; h: number } {
  if (typeof window === "undefined") return { w: 1200, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
}

function readRect(): Rect | null {
  return readJson<Rect | null>(RECT_KEY, null);
}

function writeRect(rect: Rect): void {
  writeJson(RECT_KEY, rect);
}

/**
 * A `ScratchStorage` over `globalThis.localStorage` that can never throw —
 * neither on the property access itself (absent in a non-browser context)
 * nor on `getItem`/`setItem` (privacy mode, quota). Mirrors `lib/prefs.ts`'s
 * own safe-storage convention for `scratchTabs`' injectable storage contract.
 */
const safeLocalStorage: ScratchStorage = {
  getItem(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // ignore: storage may be unavailable
    }
  },
};

/** The default spot: tucked into the bottom-right, near the trigger. */
function defaultRect(): Rect {
  const { w: vw, h: vh } = viewport();
  return {
    x: Math.max(MARGIN, vw - DEFAULT_W - MARGIN),
    y: Math.max(MARGIN, vh - DEFAULT_H - MARGIN),
    w: DEFAULT_W,
    h: DEFAULT_H,
  };
}

/** Keep the panel on-screen and within size bounds. */
function clampRect(rect: Rect): Rect {
  const { w: vw, h: vh } = viewport();
  const w = Math.min(Math.max(rect.w, MIN_W), vw - MARGIN);
  const h = Math.min(Math.max(rect.h, MIN_H), vh - MARGIN);
  const x = Math.min(Math.max(rect.x, 0), Math.max(0, vw - w));
  const y = Math.min(Math.max(rect.y, 0), Math.max(0, vh - h));
  return { x, y, w, h };
}

/** A small header action button (timestamp / copy / clear / close). */
function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded text-ink-3 transition-colors duration-100 hover:bg-raise hover:text-ink-2"
    >
      {children}
    </button>
  );
}

/**
 * One tab pill: click to switch, double-click to rename, × to close.
 * Sized to stay legible and tappable even at the pad's 280px minimum width.
 */
function TabPill({
  label,
  active,
  onSelect,
  onRename,
  onClose,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.select());
  }, [editing]);

  const commit = (): void => {
    setEditing(false);
    onRename(draft);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(label);
            setEditing(false);
          }
        }}
        className="h-6 w-24 shrink-0 rounded border border-accent-line bg-surface px-1.5 text-[11.5px] text-ink outline-none"
      />
    );
  }

  return (
    <div
      onClick={onSelect}
      onDoubleClick={() => {
        setDraft(label);
        setEditing(true);
      }}
      title={label}
      className={`group flex h-6 shrink-0 max-w-[104px] cursor-default select-none items-center gap-1 rounded px-1.5 text-[11.5px] ${
        active ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:bg-raise hover:text-ink-2"
      }`}
    >
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={active ? `Close ${label} (⌘W)` : `Close ${label}`}
        title={active ? "Close (⌘W)" : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm opacity-0 hover:bg-line group-hover:opacity-100"
      >
        <Icon name="x" size={10} />
      </button>
    </div>
  );
}

/** The scrollable strip of tab pills plus the "add tab" affordance. */
function TabStrip({
  state,
  onSelect,
  onRename,
  onCloseRequest,
  onAdd,
}: {
  state: ScratchState;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onCloseRequest: (id: string) => void;
  onAdd: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-0.5 border-b border-line bg-surface-2 px-1.5 py-1">
      <div className="scroll flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {state.tabs.map((tab) => (
          <TabPill
            key={tab.id}
            label={tabTitle(tab)}
            active={tab.id === state.activeId}
            onSelect={() => onSelect(tab.id)}
            onRename={(name) => onRename(tab.id, name)}
            onClose={() => onCloseRequest(tab.id)}
          />
        ))}
      </div>
      <HeaderButton label="New tab (⌘T)" onClick={onAdd}>
        <Icon name="plus" size={13} />
      </HeaderButton>
    </div>
  );
}

/** The floating scratchpad, mounted at the app root. */
export function Scratchpad(): JSX.Element | null {
  const open = useStore((s) => s.scratchOpen);
  const close = useStore((s) => s.closeScratch);
  const theme = useStore((s) => s.theme);

  // Presence: stay mounted through the exit animation.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  const [state, setState] = useState<ScratchState>(() => loadState(safeLocalStorage));
  const [rect, setRect] = useState<Rect>(() => clampRect(readRect() ?? defaultRect()));
  const [copied, setCopied] = useState(false);

  const textRef = useRef<HTMLTextAreaElement>(null);
  // Latest rect, so drag/resize can persist the final value on pointer-up.
  const rectRef = useRef(rect);
  rectRef.current = rect;

  const tab = activeTab(state);

  // Mount on open; on close, run the exit animation, then unmount.
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
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Focus the pad and re-clamp it (in case the window resized) on open.
  useEffect(() => {
    if (!open) return;
    setRect((r) => clampRect(r));
    const id = requestAnimationFrame(() => textRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  /** Apply a pure scratchTabs transition, persisting the result. */
  const update = (next: ScratchState): void => {
    setState(next);
    saveState(safeLocalStorage, next);
  };

  const updateText = (value: string): void => update(setTabText(state, tab.id, value));

  const persistRect = (): void => writeRect(rectRef.current);

  const startDrag = (e: React.PointerEvent): void => {
    if ((e.target as HTMLElement).closest("button, input")) return; // header/tab controls aren't drag handles
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const orig = rect;
    const move = (ev: PointerEvent): void => {
      setRect(clampRect({ ...orig, x: orig.x + (ev.clientX - sx), y: orig.y + (ev.clientY - sy) }));
    };
    const stop = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      persistRect();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const orig = rect;
    const move = (ev: PointerEvent): void => {
      setRect(clampRect({ ...orig, w: orig.w + (ev.clientX - sx), h: orig.h + (ev.clientY - sy) }));
    };
    const stop = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      persistRect();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const insertTimestamp = (): void => {
    const stamp = `— ${new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}\n`;
    const el = textRef.current;
    if (!el) {
      updateText(tab.text + stamp);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    updateText(tab.text.slice(0, start) + stamp + tab.text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + stamp.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const copyAll = (): void => {
    if (!tab.text) return;
    void navigator.clipboard
      ?.writeText(tab.text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {
        // clipboard may be blocked; ignore
      });
  };

  const clearAll = async (): Promise<void> => {
    if (tab.text.trim() && !(await confirmDestructive("Clear this tab?", "Clear"))) return;
    updateText("");
    textRef.current?.focus();
  };

  /** Focus the textarea next frame — after a tab switch/add remounts it (keyed by tab id). */
  const focusTextarea = (): void => {
    requestAnimationFrame(() => textRef.current?.focus());
  };

  const addNewTab = (): void => {
    update(addTab(state));
    focusTextarea();
  };

  const selectTab = (id: string): void => {
    update(switchTab(state, id));
    focusTextarea();
  };

  const renameTheTab = (id: string, name: string): void => update(renameTab(state, id, name));

  const requestCloseTab = async (id: string): Promise<void> => {
    const target = state.tabs.find((t) => t.id === id);
    if (
      target?.text.trim() &&
      !(await confirmDestructive(`Close "${tabTitle(target)}"? This can't be undone.`, "Close"))
    )
      return;
    update(closeTab(state, id));
    focusTextarea();
  };

  /**
   * Standard macOS tab shortcuts, scoped to the pad by living on its root
   * `onKeyDown` (same pattern as the Escape handler below): only keydowns
   * whose target is inside this `<aside>` ever reach here, so ⌘T/⌘W/⌘1-9
   * can never fire while typing in a task title, a note, or the palette,
   * and ⌘W can never shadow a window-level close-window shortcut.
   */
  const handleTabShortcuts = (e: React.KeyboardEvent): void => {
    const cmd = e.metaKey && !e.altKey;
    if (cmd && e.key.toLowerCase() === "t") {
      e.preventDefault();
      e.stopPropagation();
      addNewTab();
    } else if (cmd && e.key.toLowerCase() === "w") {
      e.preventDefault();
      e.stopPropagation();
      void requestCloseTab(tab.id);
    } else if (cmd && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      update(nthTab(state, Number(e.key)));
      focusTextarea();
    } else if (e.metaKey && e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      e.stopPropagation();
      update(e.key === "ArrowRight" ? nextTab(state) : prevTab(state));
      focusTextarea();
    } else if (e.ctrlKey && e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      update(e.shiftKey ? prevTab(state) : nextTab(state));
      focusTextarea();
    }
  };

  if (!mounted) return null;

  return (
    <aside
      role="dialog"
      aria-label="Scratchpad"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, colorScheme: theme }}
      className={`fixed z-50 flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow ${
        closing ? "ng-scratch-out" : "ng-scratch-in"
      }`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
          return;
        }
        handleTabShortcuts(e);
      }}
    >
      <header
        onPointerDown={startDrag}
        className="flex cursor-grab select-none items-center gap-2 border-b border-line bg-surface-2 px-2.5 py-2 active:cursor-grabbing"
      >
        <Icon name="scratch" size={14} className="text-ink-3" />
        <span className="flex-1 text-[12px] font-semibold uppercase tracking-[.06em] text-ink-3">
          Scratchpad
        </span>
        <HeaderButton label="Insert time" onClick={insertTimestamp}>
          <Icon name="clock" size={14} />
        </HeaderButton>
        <HeaderButton label={copied ? "Copied" : "Copy all"} onClick={copyAll}>
          <Icon name={copied ? "check" : "copy"} size={14} />
        </HeaderButton>
        <HeaderButton label="Clear" onClick={clearAll}>
          <Icon name="trash" size={14} />
        </HeaderButton>
        <HeaderButton label="Close (⌘J)" onClick={close}>
          <Icon name="x" size={15} />
        </HeaderButton>
      </header>

      <TabStrip
        state={state}
        onSelect={selectTab}
        onRename={renameTheTab}
        onCloseRequest={requestCloseTab}
        onAdd={addNewTab}
      />

      <textarea
        key={tab.id}
        ref={textRef}
        value={tab.text}
        onChange={(e) => updateText(e.target.value)}
        placeholder="Brain dump… thoughts, scraps, anything in-flight."
        spellCheck={false}
        className="scroll min-h-0 flex-1 resize-none border-none bg-transparent px-3.5 py-3 text-[13.5px] leading-[1.6] text-ink outline-none placeholder:text-ink-3"
      />

      <footer className="border-t border-line px-3 py-1.5 text-[11px] text-ink-3">
        On this device only — never saved to your vault
      </footer>

      <div
        onPointerDown={startResize}
        aria-hidden="true"
        className="absolute bottom-0 right-0 grid h-4 w-4 cursor-nwse-resize place-items-center text-ink-3"
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
          <path
            d="M11 15 15 11M7.5 15 15 7.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </aside>
  );
}
