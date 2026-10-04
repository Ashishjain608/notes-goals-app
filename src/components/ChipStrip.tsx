/**
 * ChipStrip — a horizontally scrolling row of 44px toggle chips that bleeds to
 * the right edge (phone Tasks filters). Store-free; `aria-pressed` per chip.
 */
import type { JSX } from "react";
import { Icon, type IconName } from "./Icon";

export interface Chip<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export interface ChipStripProps<T extends string> {
  label: string;
  chips: ReadonlyArray<Chip<T>>;
  pressed: ReadonlyArray<T>;
  onToggle: (value: T) => void;
}

export function ChipStrip<T extends string>({ label, chips, pressed, onToggle }: ChipStripProps<T>): JSX.Element {
  return (
    <div role="group" aria-label={label} className="-mr-4 flex gap-2 overflow-x-auto pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.map((c) => {
        const on = pressed.includes(c.value);
        return (
          <button
            key={c.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(c.value)}
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-[22px] px-3.5 text-[14px] font-medium ${
              on ? "border border-accent-line bg-accent-soft text-accent-ink" : "border border-line-2 bg-surface text-ink"
            }`}
          >
            {c.icon && <Icon name={c.icon} size={16} />}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
