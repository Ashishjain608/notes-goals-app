/**
 * SlateCard — a committed task on Today (phone): larger than a compact row,
 * context dot + meta under a semibold title. Store-free.
 */
import type { JSX, ReactNode } from "react";
import type { Context } from "@/types";
import { Checkbox } from "./Checkbox";
import { ContextDot } from "./ContextDot";

export interface SlateCardProps {
  title: string;
  context: Context;
  /** Meta text after the dot ("Due today · Launch"); pass nodes to colour an age tag. */
  meta?: ReactNode;
  done?: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

export function SlateCard({ title, context, meta, done, onToggle, onOpen }: SlateCardProps): JSX.Element {
  return (
    <div className="flex min-h-[68px] items-center rounded-2xl bg-surface py-1.5 pl-1 pr-3.5 shadow-card">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center">
        <Checkbox checked={!!done} size={26} onClick={onToggle} />
      </div>
      <button type="button" onClick={onOpen} className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center pl-1 text-left">
        <span className={`truncate text-[16px] font-semibold ${done ? "text-ink-3 line-through" : "text-ink"}`}>{title}</span>
        <span className="flex items-center gap-2 text-[13px] text-ink-2">
          <ContextDot context={context} size={9} />
          {meta && <span className="truncate">{meta}</span>}
        </span>
      </button>
    </div>
  );
}
