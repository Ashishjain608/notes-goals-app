/**
 * SegmentedControl — pick one of a few options (phone, ADR-0012). Store-free.
 * Track ink@6; the selected segment is a raised surface.
 */
import type { JSX } from "react";

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>): JSX.Element {
  return (
    <div role="group" aria-label={label} className="flex h-12 rounded-3xl bg-ink-6 p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onChange(o.value)}
            className={`h-11 rounded-[22px] px-[18px] text-[15px] ${
              on ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(40,40,90,.06)]" : "font-medium text-ink-2"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
