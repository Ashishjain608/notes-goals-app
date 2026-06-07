/**
 * Checkbox — the round (open/done) or square (dropped) task toggle.
 *
 * Stateless: hover affordances are pure CSS (`group`/`hover:` utilities) rather
 * than React state, so the control is fully presentational. Stops click
 * propagation so toggling never opens the parent row.
 */
import type { JSX } from "react";
import { Icon } from "./Icon";

export interface CheckboxProps {
  checked: boolean;
  dropped?: boolean;
  /** Pixel size of the box. Defaults to 18. */
  size?: number;
  onClick?: () => void;
}

/** Render the task completion toggle. */
export function Checkbox({ checked, dropped = false, size = 18, onClick }: CheckboxProps): JSX.Element {
  const shape = dropped ? "rounded-sm" : "rounded-full";
  const border = checked ? "border-accent" : "border-line-2 group-hover/cb:border-accent";
  const fill = checked ? "bg-accent" : "bg-transparent";
  const iconSize = size - 6;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={checked ? "Mark open" : "Mark done"}
      className={`group/cb mt-px grid flex-shrink-0 place-items-center border-[1.6px] text-white transition-all duration-150 ${shape} ${border} ${fill}`}
      style={{ width: size, height: size }}
    >
      {checked && <Icon name="check" size={iconSize} />}
      {!checked && dropped && <span className="bg-ink-3" style={{ width: 7, height: 1.6 }} />}
      {!checked && !dropped && (
        <span className="text-accent opacity-0 transition-opacity duration-150 group-hover/cb:opacity-50">
          <Icon name="check" size={iconSize} />
        </span>
      )}
    </button>
  );
}
