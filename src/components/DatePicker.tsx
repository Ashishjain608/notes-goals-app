/**
 * DatePicker — a themeable, inline calendar grid, plus a popover field built on
 * top of it.
 *
 * Replaces native `<input type="date">` everywhere in the app: WebKit's native
 * calendar is unstyleable and (in the 460px task-detail drawer pinned to the
 * window's right edge) renders past the screen edge and gets clipped. `monthGrid`
 * is the pure day-layout function (unit-tested); `DatePicker` is a controlled,
 * always-inline month grid (no positioning of its own); `DateField` wraps it in
 * a button + absolutely-positioned popover that flips up/left to stay on screen.
 * All day keys are local `YYYY-MM-DD` (docs/adr/0004) — built with `toLocalDateKey`
 * so there is no UTC drift.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { IsoDate } from "@/types";
import { localToday, toLocalDateKey, formatShortDate } from "@/lib/dates";
import { Icon } from "./Icon";

/** One cell in a month grid: its local day key, day-of-month number, and whether it belongs to the displayed month (vs. a dimmed leading/trailing day). */
export interface MonthDay {
  key: IsoDate;
  day: number;
  inMonth: boolean;
}

const DAYS_PER_WEEK = 7;
const WEEKS_PER_GRID = 6;

/**
 * Pure 6x7 (42-cell) grid of local day keys for `year`/`month` (JS Date's
 * 0-based month convention), starting on Sunday. Leading/trailing days from
 * the adjacent months fill out the grid with `inMonth: false` so callers can
 * dim them. Built entirely from local `Date` field getters/setters (never UTC
 * or millisecond arithmetic), so it is stable across DST transitions.
 */
export function monthGrid(year: number, month: number): MonthDay[] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());

  const days: MonthDay[] = [];
  for (let i = 0; i < DAYS_PER_WEEK * WEEKS_PER_GRID; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    days.push({ key: toLocalDateKey(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return days;
}

/** True when `key` falls strictly before `min` or strictly after `max` (bounds are pickable). */
export function isDayDisabled(key: IsoDate, min?: IsoDate, max?: IsoDate): boolean {
  if (min && key < min) return true;
  if (max && key > max) return true;
  return false;
}

/** Parse a local 'YYYY-MM-DD' key back to that calendar day's local midnight. */
function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export interface DatePickerProps {
  value: IsoDate | null;
  /** Days before this key render disabled (e.g. "no snoozing into the past"). */
  min?: IsoDate;
  /** Days after this key render disabled (e.g. Activity's "no future days"). */
  max?: IsoDate;
  onPick: (date: IsoDate) => void;
}

/**
 * A controlled, inline month grid — no popover, no positioning. Prev/next
 * month, a "Today" shortcut, days outside [min, max] disabled, the selected
 * day marked in accent, today outlined. Arrow keys move focus by day, Enter
 * picks, and every cell is reachable by Tab via a roving tabindex.
 */
export function DatePicker({ value, min, max, onPick }: DatePickerProps): JSX.Element {
  const todayKey = localToday();
  const seedDate = keyToDate(value ?? todayKey);
  const [viewYear, setViewYear] = useState(seedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(seedDate.getMonth());
  const [focusedKey, setFocusedKey] = useState(value ?? todayKey);
  const focusPending = useRef(false);

  const weeks = useMemo(() => {
    const grid = monthGrid(viewYear, viewMonth);
    const rows: MonthDay[][] = [];
    for (let i = 0; i < grid.length; i += DAYS_PER_WEEK) rows.push(grid.slice(i, i + DAYS_PER_WEEK));
    return rows;
  }, [viewYear, viewMonth]);

  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  // Only move DOM focus when a keyboard move (or month nav following one)
  // requested it — not on every render, so opening the picker doesn't steal focus.
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    cellRefs.current.get(focusedKey)?.focus();
  }, [focusedKey, viewYear, viewMonth]);

  const goToMonth = (delta: number): void => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const disabled = (key: string): boolean => isDayDisabled(key, min, max);

  const moveFocus = (fromKey: string, deltaDays: number): void => {
    const d = keyToDate(fromKey);
    d.setDate(d.getDate() + deltaDays);
    const nextKey = toLocalDateKey(d);
    focusPending.current = true;
    setFocusedKey(nextKey);
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  };

  const pick = (key: string): void => {
    if (disabled(key)) return;
    onPick(key);
  };

  const onCellKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, key: string): void => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(key, -1);
        break;
      case "ArrowRight":
        e.preventDefault();
        moveFocus(key, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(key, -DAYS_PER_WEEK);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(key, DAYS_PER_WEEK);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(key);
        break;
      default:
        break;
    }
  };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-1.5">
        <button
          type="button"
          aria-label="Previous month"
          title="Previous month"
          onClick={() => goToMonth(-1)}
          className="grid h-6 w-6 place-items-center rounded text-ink-2 transition-colors hover:bg-raise"
        >
          <Icon name="chevron" size={14} className="rotate-180" />
        </button>
        <span className="text-[12.5px] font-medium text-ink">{monthLabel}</span>
        <button
          type="button"
          aria-label="Next month"
          title="Next month"
          onClick={() => goToMonth(1)}
          className="grid h-6 w-6 place-items-center rounded text-ink-2 transition-colors hover:bg-raise"
        >
          <Icon name="chevron" size={14} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 px-1 text-center text-[10.5px] font-medium text-ink-3">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>

      <div role="grid" aria-label={monthLabel} className="px-1">
        {weeks.map((week, i) => (
          <div key={i} role="row" className="grid grid-cols-7 gap-y-0.5">
            {week.map((cell) => {
              const selected = cell.key === value;
              const isToday = cell.key === todayKey;
              const isDisabled = disabled(cell.key);
              return (
                <button
                  key={cell.key}
                  ref={(el) => {
                    if (el) cellRefs.current.set(cell.key, el);
                    else cellRefs.current.delete(cell.key);
                  }}
                  type="button"
                  role="gridcell"
                  aria-selected={selected}
                  aria-disabled={isDisabled || undefined}
                  disabled={isDisabled}
                  tabIndex={cell.key === focusedKey ? 0 : -1}
                  onClick={() => pick(cell.key)}
                  onKeyDown={(e) => onCellKeyDown(e, cell.key)}
                  onFocus={() => setFocusedKey(cell.key)}
                  className={`m-auto grid h-7 w-7 place-items-center rounded-full text-[12.5px] transition-colors duration-100 ${
                    !cell.inMonth ? "text-ink-3" : "text-ink"
                  } ${selected ? "bg-accent text-white" : isDisabled ? "cursor-not-allowed opacity-30" : "hover:bg-raise"} ${
                    isToday && !selected ? "ring-1 ring-inset ring-accent-line" : ""
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="px-1 pt-1.5">
        <button
          type="button"
          onClick={() => pick(todayKey)}
          disabled={disabled(todayKey)}
          className="w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium text-accent-ink transition-colors hover:bg-raise disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          Today
        </button>
      </div>
    </div>
  );
}

export interface DateFieldProps {
  value: IsoDate | null;
  min?: IsoDate;
  max?: IsoDate;
  onPick: (date: IsoDate) => void;
  placeholder?: string;
  className?: string;
}

const DEFAULT_FIELD_CLASS =
  "rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-ink-2 outline-none transition-colors hover:bg-raise";

/** Where the popover should sit relative to the field's `getBoundingClientRect`. */
interface Placement {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

const POPOVER_WIDTH = 232;
const POPOVER_HEIGHT = 320;
const POPOVER_GAP = 4;

/** Flip up and/or left when the popover would otherwise leave the viewport. */
function placePopover(anchor: DOMRect): Placement {
  const flipUp = anchor.bottom + POPOVER_GAP + POPOVER_HEIGHT > window.innerHeight;
  const flipLeft = anchor.left + POPOVER_WIDTH > window.innerWidth;
  return {
    top: flipUp ? undefined : anchor.bottom + POPOVER_GAP,
    bottom: flipUp ? window.innerHeight - anchor.top + POPOVER_GAP : undefined,
    left: flipLeft ? undefined : anchor.left,
    right: flipLeft ? window.innerWidth - anchor.right : undefined,
  };
}

/**
 * A button showing the formatted value (or a placeholder) that opens a
 * `DatePicker` in a fixed-position popover. Flips up/left to stay in the
 * viewport, and closes on Escape, outside click, or a pick.
 */
export function DateField({
  value,
  min,
  max,
  onPick,
  placeholder = "Pick a date",
  className,
}: DateFieldProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    setPlacement(placePopover(buttonRef.current.getBoundingClientRect()));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={className ?? DEFAULT_FIELD_CLASS}
      >
        {value ? formatShortDate(value) : <span className="text-ink-3">{placeholder}</span>}
      </button>
      {open && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", ...placement, width: POPOVER_WIDTH }}
          className="z-50 rounded-lg border border-line bg-surface py-2 shadow"
        >
          <DatePicker
            value={value}
            min={min}
            max={max}
            onPick={(date) => {
              onPick(date);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
