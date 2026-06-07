/**
 * Note-card excerpt derivation.
 *
 * `Note` metadata carries no stored snippet (see src/types.ts), so the list
 * builds a preview from the lazily-fetched markdown body: strip the lightweight
 * markdown syntax we support (headings, list/quote markers, emphasis, links,
 * inline code) down to readable prose, collapse whitespace, and clamp to a fixed
 * character budget. Until a note's body has loaded, the card shows a neutral
 * placeholder rather than nothing.
 */

/** Roughly the first ~120 characters of body, used as a list-card preview. */
const EXCERPT_CHARS = 120;

/** Shown before a note's body has been fetched (bodies load lazily). */
export const EXCERPT_PLACEHOLDER = "No additional text";

/**
 * Reduce a markdown body to a single line of plain-text preview, clamped to
 * ~120 chars. Returns the placeholder for an empty/whitespace-only body.
 */
export function excerptFromMarkdown(markdown: string): string {
  const plain = stripMarkdown(markdown);
  if (plain.length === 0) return EXCERPT_PLACEHOLDER;
  if (plain.length <= EXCERPT_CHARS) return plain;
  return `${plain.slice(0, EXCERPT_CHARS).trimEnd()}…`;
}

/** Strip the supported markdown syntax to plain prose and collapse whitespace. */
function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → label
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // ATX heading markers
    .replace(/^\s{0,3}>\s?/gm, "") // blockquote markers
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/gm, "") // bullet / task-list markers
    .replace(/^\s*\d+\.\s+/gm, "") // ordered-list markers
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/~~(.*?)~~/g, "$2") // strikethrough
    .replace(/\s+/g, " ") // collapse all whitespace/newlines
    .trim();
}
