/**
 * SidebarToggle — the partition between the nav rail and the content.
 *
 * The border itself is a static hairline; the control is a small vertical line
 * segment near the top that sits on it. At rest it's a muted pill; on hover it
 * brightens to accent. Clicking it (or ⌘B) expands/collapses the sidebar between
 * its labelled and icon-only layouts.
 */
export interface SidebarToggleProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function SidebarToggle({ collapsed, onToggle }: SidebarToggleProps): JSX.Element {
  return (
    <div className="relative w-px shrink-0 bg-line">
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-pressed={collapsed}
        title={collapsed ? "Expand sidebar  ⌘B" : "Collapse sidebar  ⌘B"}
        className="group/sb absolute left-1/2 top-[42%] flex h-10 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      >
        <span className="h-7 w-1 rounded-full bg-line-2 transition-colors duration-150 group-hover/sb:bg-accent" />
      </button>
    </div>
  );
}
