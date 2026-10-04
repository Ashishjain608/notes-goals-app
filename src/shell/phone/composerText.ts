/** Pure text edits behind the phone composer. */

const CHECK_ITEM = "- [ ] ";

/** `text` with [start, end) cut out and the seam's whitespace collapsed. */
export function cutRange(text: string, start: number, end: number): string {
  return (text.slice(0, start).trimEnd() + " " + text.slice(end).trimStart()).trim();
}

/**
 * Enter inside a checklist body: continue the list. Returns the new value and
 * caret, or null to let the textarea insert a plain newline. Enter on an empty
 * item ends the list by clearing that item.
 */
export function continueChecklist(value: string, caret: number): { value: string; caret: number } | null {
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const line = value.slice(lineStart, caret);
  if (!line.startsWith(CHECK_ITEM)) return null;
  if (line === CHECK_ITEM && value.slice(caret).split("\n")[0] === "") {
    return { value: value.slice(0, lineStart) + value.slice(caret), caret: lineStart };
  }
  const insert = "\n" + CHECK_ITEM;
  return { value: value.slice(0, caret) + insert + value.slice(caret), caret: caret + insert.length };
}

/** True when a note body holds nothing but empty checklist items. */
export function isBlankBody(body: string): boolean {
  return body.split("\n").every((l) => l.trim() === "" || l.trim() === CHECK_ITEM.trim());
}
