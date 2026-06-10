/**
 * Icon — the minimal, geometric line-icon set (1.6px stroke on a 24 grid).
 *
 * Ported verbatim from the design prototype (notes-goals-claude-design/icons.jsx)
 * and extended with a `trash` glyph in the same style. Purely presentational:
 * renders an <svg> that inherits `currentColor`, so callers control color with a
 * Tailwind text-* utility on an ancestor.
 */
import type { JSX } from "react";

export type IconName =
  | "today"
  | "tasks"
  | "notes"
  | "notebook"
  | "goals"
  | "search"
  | "plus"
  | "check"
  | "moon"
  | "sun"
  | "chevron"
  | "chevronDown"
  | "clock"
  | "snooze"
  | "calendar"
  | "link"
  | "settings"
  | "x"
  | "dropped"
  | "arrowRight"
  | "inbox"
  | "dot"
  | "flame"
  | "command"
  | "trash"
  | "flag"
  | "listBullet"
  | "quote"
  | "rule"
  | "scratch"
  | "copy";

/** Shared stroke attributes for every line glyph. */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const paths: Record<IconName, JSX.Element> = {
  today: (
    // A calendar with today's date marked — distinct from the Activity clock.
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" {...stroke} />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" {...stroke} />
      <rect x="9.8" y="12.4" width="4.4" height="4.4" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  tasks: <path d="M5 7h14M5 12h14M5 17h9" {...stroke} />,
  notes: (
    <>
      <path d="M6 4h8l4 4v12H6z" {...stroke} />
      <path d="M14 4v4h4" {...stroke} />
      <path d="M9 13h6M9 16.5h4" {...stroke} />
    </>
  ),
  notebook: (
    // A bound notebook — distinct from the folded-corner `notes` document.
    <>
      <rect x="5" y="4" width="13" height="16" rx="1.6" {...stroke} />
      <path d="M8.5 4v16M11 9h4M11 12.5h4" {...stroke} />
    </>
  ),
  goals: (
    <>
      <circle cx="12" cy="12" r="7.5" {...stroke} />
      <circle cx="12" cy="12" r="3.4" {...stroke} />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" {...stroke} />
      <path d="m20 20-3.6-3.6" {...stroke} />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" {...stroke} />,
  check: <path d="m5 12.5 4.5 4.5L19 7" {...stroke} />,
  moon: <path d="M19 13.5A7 7 0 1 1 10.5 5a5.6 5.6 0 0 0 8.5 8.5Z" {...stroke} />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" {...stroke} />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
        {...stroke}
      />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" {...stroke} />,
  chevronDown: <path d="m6 9 6 6 6-6" {...stroke} />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M12 8v4.2l3 1.8" {...stroke} />
    </>
  ),
  snooze: (
    <>
      <path d="M14 5h5l-5 6h5" {...stroke} transform="translate(-1 1) scale(0.9)" />
      <path d="M4 13h4l-4 5h4" {...stroke} transform="translate(2 0)" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2" {...stroke} />
      <path d="M4 9.5h16M8 3.5v3M16 3.5v3" {...stroke} />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 7.3" {...stroke} />
      <path d="M14 10a4 4 0 0 0-5.7 0L6 12.3a4 4 0 0 0 5.7 5.7L13 16.7" {...stroke} />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="2.8" {...stroke} />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"
        {...stroke}
      />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" {...stroke} />,
  dropped: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M8.5 12h7" {...stroke} />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" {...stroke} />,
  inbox: (
    <>
      <path d="M4 13l2.5-7h11L20 13v5H4z" {...stroke} />
      <path d="M4 13h4l1.5 2.5h5L16 13h4" {...stroke} />
    </>
  ),
  dot: <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />,
  flame: (
    <path
      d="M12 3.5c2.5 3 4.5 5 4.5 8a4.5 4.5 0 1 1-9 0c0-1.4.6-2.6 1.6-3.6.2 1 .8 1.8 1.6 2 .1-2.3.6-4.4 1.3-6.4Z"
      {...stroke}
    />
  ),
  command: (
    <path
      d="M9 9V7a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v2m0 6v2a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2v-2m0-6h6v6H9z"
      {...stroke}
    />
  ),
  // Added for this app: a simple bin glyph in the same 1.6px / 24-grid style.
  trash: (
    <>
      <path d="M5 7h14M10 4.5h4M9 7l.6 12h4.8L15 7" {...stroke} />
      <path d="M10.5 10.5v5.5M13.5 10.5v5.5" {...stroke} />
    </>
  ),
  // Priority marker: a pennant flag on a pole.
  flag: (
    <>
      <path d="M6.5 21V4" {...stroke} />
      <path d="M6.5 4.5h11l-2.4 3.1 2.4 3.2h-11" {...stroke} />
    </>
  ),
  // Bullet list: dots + lines.
  listBullet: (
    <>
      <path d="M9 7h11M9 12h11M9 17h11" {...stroke} />
      <circle cx="4.6" cy="7" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="17" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  // Blockquote: a leading bar with text lines.
  quote: (
    <>
      <path d="M5 6v12" {...stroke} />
      <path d="M9 8h10M9 12h10M9 16h6" {...stroke} />
    </>
  ),
  // Horizontal rule / divider: a line with a center dot.
  rule: (
    <>
      <path d="M4 12h6M14 12h6" {...stroke} />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  // Scratchpad: a pad with text lines and a pencil writing across it.
  scratch: (
    <>
      <path d="M4.5 7h7M4.5 11h4.5" {...stroke} />
      <path d="M13.5 16.5l1-3 5.5-5.5 2 2-5.5 5.5-3 1z" {...stroke} />
    </>
  ),
  // Copy: two overlapping cards.
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" {...stroke} />
      <path d="M5 15.5V6a1.5 1.5 0 0 1 1.5-1.5H15" {...stroke} />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  /** Pixel size for both width and height (square). Defaults to 20. */
  size?: number;
  className?: string;
}

/** Render a single line icon. Color follows the text color via `currentColor`. */
export function Icon({ name, size = 20, className }: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
