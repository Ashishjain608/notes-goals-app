/**
 * NoteCard — one note in the phone Notes list (ADR-0012). Store-free: title,
 * a 2-line serif preview, and a meta line ("● Notebook · Goal · 3d").
 */
import type { JSX } from "react";
import type { Context } from "@/types";
import { ContextDot } from "./ContextDot";

export interface NoteCardProps {
  title: string;
  preview: string;
  context: Context;
  notebook?: string | null;
  goal?: string | null;
  age: string;
  onClick: () => void;
}

export function NoteCard({ title, preview, context, notebook, goal, age, onClick }: NoteCardProps): JSX.Element {
  const meta = [notebook, goal, age].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-1.5 rounded-2xl bg-surface px-4 py-3.5 text-left shadow-card active:bg-raise"
    >
      <span className="truncate text-[16px] font-semibold text-ink">{title || "Untitled"}</span>
      <span className="line-clamp-2 font-serif text-[15px] leading-[1.45] text-ink-2">{preview}</span>
      <span className="flex items-center gap-2 text-[13px] text-ink-2">
        <ContextDot context={context} size={9} />
        <span className="min-w-0 truncate">{meta}</span>
      </span>
    </button>
  );
}
