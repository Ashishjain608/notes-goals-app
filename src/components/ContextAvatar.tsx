/**
 * ContextAvatar — the phone header's context-filter badge: a disc ringed in
 * the Office (indigo) / Personal (emerald) colours, half-and-half for "all".
 * Store-free; the caller decides what a tap does (it opens the More sheet).
 */
import type { JSX } from "react";
import type { ContextFilter } from "@/types";

export interface ContextAvatarProps {
  filter: ContextFilter;
  onClick: () => void;
}

const TEXT: Record<ContextFilter, string> = { all: "All", office: "Off", personal: "Per" };
const NAME: Record<ContextFilter, string> = { all: "All", office: "Office", personal: "Personal" };
const R = 16.5;
const C = 2 * Math.PI * R;

export function ContextAvatar({ filter, onClick }: ContextAvatarProps): JSX.Element {
  const ring = (stroke: string, extra: object = {}) => (
    <circle cx="18" cy="18" r={R} fill="none" strokeWidth="3" stroke={stroke} {...extra} />
  );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Showing ${NAME[filter]}. Filter, Activity, Settings`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
    >
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="18" fill="var(--surface)" />
        {filter === "all" ? (
          <>
            {ring("var(--ctx-office)", { strokeDasharray: `${C / 2} ${C}`, transform: "rotate(90 18 18)" })}
            {ring("var(--ctx-personal)", { strokeDasharray: `${C / 2} ${C}`, transform: "rotate(270 18 18)" })}
          </>
        ) : (
          ring(filter === "office" ? "var(--ctx-office)" : "var(--ctx-personal)")
        )}
        <text
          x="18"
          y="18"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="12"
          fontWeight="600"
          fill="var(--ink)"
        >
          {TEXT[filter]}
        </text>
      </svg>
    </button>
  );
}
