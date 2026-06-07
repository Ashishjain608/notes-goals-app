/**
 * Top chrome: the ⌘K capture/jump button and the global Context filter
 * (All / Office / Personal) that every view honors.
 */
import { ContextDot, Icon } from "@/components";
import { useStore } from "@/store";
import type { ContextFilter } from "@/types";

const FILTERS: { value: ContextFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
];

function ContextFilterControl(): JSX.Element {
  const value = useStore((s) => s.contextFilter);
  const setContextFilter = useStore((s) => s.setContextFilter);
  return (
    <div className="flex gap-0.5 rounded-md bg-surface-2 p-[3px]">
      {FILTERS.map((f) => {
        const on = value === f.value;
        return (
          <button
            key={f.value}
            onClick={() => setContextFilter(f.value)}
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-[13px] font-medium transition-colors ${
              on ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {f.value !== "all" && <ContextDot context={f.value} size={6} />}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

export function TopChrome(): JSX.Element {
  const openPalette = useStore((s) => s.openPalette);
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-b border-line bg-bg px-6 py-3.5">
      <button
        onClick={openPalette}
        className="flex min-w-[240px] items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-3 shadow-sm transition-colors hover:text-ink-2"
      >
        <Icon name="search" size={16} />
        <span className="flex-1 text-left">Capture or jump…</span>
        <kbd className="rounded border border-line-2 px-1.5 py-px font-mono text-[11px]">⌘K</kbd>
      </button>
      <div className="ml-auto">
        <ContextFilterControl />
      </div>
    </div>
  );
}
