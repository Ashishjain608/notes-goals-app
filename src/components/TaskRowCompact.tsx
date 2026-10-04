/**
 * TaskRowCompact — the phone's task row: checkbox, one-line title, one meta
 * line, optional trailing control (the Tasks list's SlateToggle). Store-free.
 * The text area is one 44px+ button that opens the task.
 */
import type { JSX, ReactNode } from "react";
import { Checkbox } from "./Checkbox";

export interface TaskRowCompactProps {
  title: string;
  meta?: string;
  /** Renders the meta in the overdue tone. */
  overdue?: boolean;
  done?: boolean;
  dropped?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  trailing?: ReactNode;
}

export function TaskRowCompact({ title, meta, overdue, done, dropped, onToggle, onOpen, trailing }: TaskRowCompactProps): JSX.Element {
  const muted = done || dropped;
  return (
    <div
      className={`flex items-center rounded-xl bg-surface py-1 pl-0.5 shadow-card ${trailing ? "pr-1.5" : "pr-3.5"} ${
        meta ? "min-h-[60px]" : "min-h-[52px]"
      }`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center">
        <Checkbox checked={!!done} dropped={dropped} size={22} onClick={onToggle} />
      </div>
      <button type="button" onClick={onOpen} className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center pl-1 text-left">
        <span className={`truncate text-[16px] ${muted ? "text-ink-3" : "text-ink"} ${done ? "line-through" : ""}`}>{title}</span>
        {meta && <span className={`truncate text-[13px] ${overdue ? "font-semibold text-age-stale-ink" : "text-ink-2"}`}>{meta}</span>}
      </button>
      {trailing}
    </div>
  );
}
