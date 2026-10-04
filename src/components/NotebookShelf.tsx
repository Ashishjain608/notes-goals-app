/**
 * NotebookShelf — the phone Notes screen's horizontal strip of notebook cards
 * (ADR-0012). Store-free. "Unfiled" is outlined; the selected card is accent-tinted.
 */
import type { JSX } from "react";
import { Icon } from "./Icon";

export interface ShelfItem {
  /** Notebook id, or "unfiled". */
  key: string;
  name: string;
  count: number;
}

export interface NotebookShelfProps {
  items: ShelfItem[];
  /** The filtering card's key, or null. */
  selected: string | null;
  onSelect: (key: string) => void;
}

export const UNFILED_KEY = "unfiled";

export function NotebookShelf({ items, selected, onSelect }: NotebookShelfProps): JSX.Element {
  return (
    <div role="group" aria-label="Notebooks" className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
      {items.map((it) => {
        const on = it.key === selected;
        const outlined = it.key === UNFILED_KEY;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            title={on ? `Show all notes` : `Show only ${it.name}`}
            onClick={() => onSelect(it.key)}
            className={`flex h-24 w-32 shrink-0 snap-start flex-col justify-between rounded-2xl p-3.5 text-left ${
              on
                ? "bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1.5px_var(--accent-line)]"
                : outlined
                  ? "bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--line-2)]"
                  : "bg-surface text-ink shadow-card"
            }`}
          >
            <span className={on ? "text-accent-ink" : "text-ink-2"}>
              <Icon name="notebook" size={20} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-semibold leading-tight">{it.name}</span>
              <span className="block text-[13px] text-ink-2">
                {it.count} {it.count === 1 ? "note" : "notes"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
