/**
 * Checkbox — the round (open/done) or square (dropped) task toggle.
 *
 * Stateless: hover affordances are pure CSS (`group`/`hover:` utilities) rather
 * than React state, so the control is fully presentational. Stops click
 * propagation so toggling never opens the parent row.
 */
import type { CSSProperties, JSX } from "react";
import { Icon } from "./Icon";

/** Completion confetti — the Spectrum family (indigo / emerald / amber / red). */
const BURST_COLORS = ["#4f46e5", "#059669", "#d97706", "#dc2626", "#818cf8", "#34d399"];

/** Twelve confetti pieces radiating out from the checkbox centre (computed once). */
const BURST: { color: string; style: CSSProperties }[] = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const radius = 20 + (i % 3) * 7;
  const tx = Math.round(Math.cos(angle) * radius);
  const ty = Math.round(Math.sin(angle) * radius);
  const rot = (i % 2 === 0 ? 1 : -1) * (140 + (i % 4) * 50);
  const color = BURST_COLORS[i % BURST_COLORS.length] as string;
  return {
    color,
    style: {
      background: color,
      "--tx": `${tx}px`,
      "--ty": `${ty}px`,
      "--rot": `${rot}deg`,
    } as unknown as CSSProperties,
  };
});

export interface CheckboxProps {
  checked: boolean;
  dropped?: boolean;
  /** Pixel size of the box. Defaults to 18. */
  size?: number;
  /** Play the completion flourish (caller decides; e.g. only for fresh completions). */
  celebrate?: boolean;
  onClick?: () => void;
}

/** Render the task completion toggle. */
export function Checkbox({
  checked,
  dropped = false,
  size = 18,
  celebrate = false,
  onClick,
}: CheckboxProps): JSX.Element {
  const shape = dropped ? "rounded-sm" : "rounded-full";
  // Unchecked ring uses ink-2 (not the hairline line-2) — line-2 reads at ~1:1
  // contrast against the priority/stale row tints, i.e. invisible; ink-2 clears
  // 3:1 non-text contrast against every row background (plain/priority/stale,
  // light and dark) without an opaque fill, so the hollow-ring look is kept.
  const border = checked ? "border-accent" : "border-ink-2 group-hover/cb:border-accent";
  const fill = checked ? "bg-accent" : "bg-transparent";
  const iconSize = size - 6;
  const celebrating = checked && celebrate;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={checked ? "Mark open" : "Mark done"}
      title={checked ? "Mark open again" : "Mark done"}
      className={`group/cb relative mt-px grid flex-shrink-0 place-items-center border-[1.6px] text-white transition-all duration-150 ${shape} ${border} ${fill} ${
        celebrating ? "ng-complete-pop" : ""
      }`}
      style={{ width: size, height: size }}
    >
      {celebrating && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0">
          {BURST.map((p, i) => (
            <span
              key={i}
              className="ng-burst-piece absolute left-1/2 top-1/2 block h-[5px] w-[5px] rounded-[1px]"
              style={p.style}
            />
          ))}
        </span>
      )}
      {checked && (
        <Icon name="check" size={iconSize} className={celebrating ? "ng-complete-draw" : undefined} />
      )}
      {!checked && dropped && <span className="bg-ink-3" style={{ width: 7, height: 1.6 }} />}
      {!checked && !dropped && (
        <span className="text-accent opacity-0 transition-opacity duration-150 group-hover/cb:opacity-50">
          <Icon name="check" size={iconSize} />
        </span>
      )}
    </button>
  );
}
