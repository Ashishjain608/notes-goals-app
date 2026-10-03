/**
 * PhoneHeader — the page title row for phone views. Not sticky: it scrolls
 * with the page. The avatar on the right opens the More sheet.
 */
import type { JSX, ReactNode } from "react";
import { ContextAvatar } from "@/components";
import { useStore } from "@/store";

export function PhoneHeader({ title, subline }: { title: string; subline?: ReactNode }): JSX.Element {
  const contextFilter = useStore((s) => s.contextFilter);
  const setPhoneOverlay = useStore((s) => s.setPhoneOverlay);
  return (
    <header className="flex items-start justify-between gap-3 pl-1">
      <div className="min-w-0">
        <h1 className="font-serif text-[30px] font-medium leading-[1.15] tracking-[-0.01em] text-ink">{title}</h1>
        {subline && <div className="mt-1 text-[14px] text-ink-2">{subline}</div>}
      </div>
      <ContextAvatar filter={contextFilter} onClick={() => setPhoneOverlay({ kind: "more" })} />
    </header>
  );
}
