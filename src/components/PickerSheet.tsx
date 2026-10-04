/**
 * PickerSheet — a phone bottom sheet listing options to pick one (ADR-0012).
 * Store-free. Used by the composer for goal, notebook, context and date.
 * Long lists get a filter field; `children` render above the list (the date
 * picker puts its native date input there).
 */
import { useEffect, useState, type JSX, type ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";
import { ContextDot } from "./ContextDot";
import { Icon } from "./Icon";
import type { Context } from "@/types";

export interface PickerOption {
  value: string;
  label: string;
  /** Secondary text on the right ("Oct 9", "Office"). */
  hint?: string;
  context?: Context;
}

export interface PickerSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  options: PickerOption[];
  selected: string | null;
  /** Called with the picked value, or null for the `noneLabel` row. */
  onPick: (value: string | null) => void;
  /** Adds a first row that picks null ("No goal", "Unfiled"). */
  noneLabel?: string;
  bottomInset?: number;
  children?: ReactNode;
}

/** Above this many options the sheet shows a filter field. */
const FILTER_AT = 7;

const ROW = "flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-[16px] text-ink active:bg-raise";

export function PickerSheet({
  open,
  onClose,
  title,
  options,
  selected,
  onPick,
  noneLabel,
  bottomInset = 0,
  children,
}: PickerSheetProps): JSX.Element {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const check = (on: boolean) => (
    <span className={`ml-auto shrink-0 text-accent-ink ${on ? "" : "invisible"}`}>
      <Icon name="check" size={20} />
    </span>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={title} bottomInset={bottomInset}>
      <div className="flex flex-col gap-1 pb-2">
        {children}
        {options.length > FILTER_AT && (
          <input
            type="search"
            aria-label={`Filter ${title.toLowerCase()}`}
            placeholder="Filter"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-1 h-11 rounded-xl bg-surface-2 px-3 text-[16px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:appearance-none"
          />
        )}
        {noneLabel && !q && (
          <button type="button" onClick={() => onPick(null)} className={`${ROW} text-ink-2`}>
            {noneLabel}
            {check(selected === null)}
          </button>
        )}
        {shown.map((o) => (
          <button key={o.value} type="button" onClick={() => onPick(o.value)} className={ROW}>
            {o.context && <ContextDot context={o.context} />}
            <span className="min-w-0 truncate">{o.label}</span>
            {o.hint && <span className="shrink-0 text-[13px] text-ink-2">{o.hint}</span>}
            {check(selected === o.value)}
          </button>
        ))}
        {shown.length === 0 && <p className="px-3 py-3 text-[15px] text-ink-3">Nothing matches “{query.trim()}”</p>}
      </div>
    </BottomSheet>
  );
}
