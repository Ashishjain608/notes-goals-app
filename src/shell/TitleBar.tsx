/**
 * TitleBar — the custom draggable window header and global toolbar.
 *
 * The window uses macOS's overlay title-bar style (the traffic-light buttons are
 * drawn over the top-left of the webview), so this strip reserves space for them
 * and carries the app identity plus the two global controls: the ⌘K capture/jump
 * button and the Context filter (All / Office / Personal) that every view honors.
 *
 * `data-tauri-drag-region` makes the bar a window-drag handle. Tauri only starts a
 * drag when the mousedown lands on the element that carries the attribute, so the
 * non-interactive identity block is marked `pointer-events-none` (mousedowns fall
 * through to the header and drag), while the interactive controls keep their
 * pointer events and therefore click normally instead of dragging.
 */
import { ContextDot, Icon } from "@/components";
import { isTauri } from "@/lib/platform";
import { useStore } from "@/store";
import type { ContextFilter } from "@/types";
import { Brand } from "./Brand";
import { SyncIndicator } from "./SyncIndicator";
import { useIsFullscreen } from "./useIsFullscreen";

const FILTERS: { value: ContextFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
];

/** The global Context filter; its value lives in the store, so all views respect it. */
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
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-[13px] max-md:px-2.5 max-md:py-[11px] font-medium transition-colors ${
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

export function TitleBar(): JSX.Element {
  const openPalette = useStore((s) => s.openPalette);
  // In macOS full screen the traffic lights are hidden, so drop the left inset
  // that normally reserves space for them.
  const fullscreen = useIsFullscreen();
  return (
    <header
      {...(isTauri ? { "data-tauri-drag-region": true } : {})}
      className={`flex h-[52px] shrink-0 select-none items-center gap-3 border-b border-line bg-bg pr-4 max-md:h-[calc(52px+env(safe-area-inset-top))] max-md:gap-2 max-md:pl-3 max-md:pr-2 max-md:pt-[env(safe-area-inset-top)] ${
        !isTauri || fullscreen ? "pl-4" : "pl-[80px]"
      }`}
    >
      {/* Identity + the empty middle: non-interactive, so the whole span is a drag handle. */}
      <div className="pointer-events-none flex flex-1 items-center gap-2.5">
        <Brand small />
        <span className="font-serif text-[14.5px] max-md:hidden font-medium tracking-[-.01em] text-ink">
          Notes &amp; Goals
        </span>
      </div>

      <button
        onClick={openPalette}
        className="flex w-[240px] items-center gap-2 max-md:hidden rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-3 shadow-sm transition-colors hover:text-ink-2"
      >
        <Icon name="search" size={16} />
        <span className="flex-1 text-left">Search or capture…</span>
        <kbd className="rounded border border-line-2 px-1.5 py-px font-mono text-[11px]">⌘K</kbd>
      </button>

      <button
        onClick={openPalette}
        aria-label="Search"
        className="hidden h-11 w-11 shrink-0 place-items-center rounded-md text-ink-2 max-md:grid"
      >
        <Icon name="search" size={20} />
      </button>

      <SyncIndicator />
      <ContextFilterControl />
    </header>
  );
}
