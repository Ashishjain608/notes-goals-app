/**
 * Scratchpad — a floating, draggable, resizable brain-dump pad.
 *
 * Deliberately NOT a Note or Task: the text lives only on this device
 * (localStorage), never in the portable vault, and it floats non-modally above
 * everything so it can be used while a task panel or any view is open — opening
 * or closing it affects no other app state. Toggled from the nav footer button
 * or ⌘J; position/size are remembered. Enter/exit use a soft scale-fade so the
 * close is animated (the panel stays mounted until the exit finishes).
 */
import { useEffect, useRef, useState, type JSX } from "react";
import { useStore } from "@/store";
import { Icon } from "@/components";

const TEXT_KEY = "ng-scratch";
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

function readText(): string {
  try {
    return localStorage.getItem(TEXT_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeText(value: string): void {
  try {
    localStorage.setItem(TEXT_KEY, value);
  } catch {
    // storage may be unavailable; the pad still works for this session
  }
}

function readRect(): Rect | null {
  try {
    const raw = localStorage.getItem(RECT_KEY);
    return raw ? (JSON.parse(raw) as Rect) : null;
  } catch {
    return null;
  }
}

function writeRect(rect: Rect): void {
  try {
    localStorage.setItem(RECT_KEY, JSON.stringify(rect));
  } catch {
    // ignore
  }
}

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

/** The floating scratchpad, mounted at the app root. */
export function Scratchpad(): JSX.Element | null {
  const open = useStore((s) => s.scratchOpen);
  const close = useStore((s) => s.closeScratch);
  const theme = useStore((s) => s.theme);

  // Presence: stay mounted through the exit animation.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  const [text, setText] = useState(readText);
  const [rect, setRect] = useState<Rect>(() => clampRect(readRect() ?? defaultRect()));
  const [copied, setCopied] = useState(false);

  const textRef = useRef<HTMLTextAreaElement>(null);
  // Latest rect, so drag/resize can persist the final value on pointer-up.
  const rectRef = useRef(rect);
  rectRef.current = rect;

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

  const updateText = (value: string): void => {
    setText(value);
    writeText(value);
  };

  const persistRect = (): void => writeRect(rectRef.current);

  const startDrag = (e: React.PointerEvent): void => {
    if ((e.target as HTMLElement).closest("button")) return; // header buttons aren't drag handles
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
      updateText(text + stamp);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    updateText(text.slice(0, start) + stamp + text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + stamp.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const copyAll = (): void => {
    if (!text) return;
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {
        // clipboard may be blocked; ignore
      });
  };

  const clearAll = (): void => {
    if (text.trim() && !window.confirm("Clear the scratchpad?")) return;
    updateText("");
    textRef.current?.focus();
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
        }
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

      <textarea
        ref={textRef}
        value={text}
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
