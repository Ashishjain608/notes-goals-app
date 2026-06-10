/**
 * TipTap editor configuration for Notes — WYSIWYG in, GFM markdown out
 * (docs/adr/0005). Bodies are stored as Markdown; the editor never shows raw
 * syntax. Supported, round-trip-stable nodes only; Obsidian-specific syntax
 * (wikilinks, callouts, embeds) is intentionally NOT a node here.
 */

import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { Markdown } from "tiptap-markdown";

/** Faint prompt shown in an empty note body. */
export const NOTE_PLACEHOLDER = "Start writing…";

/**
 * The note editor's extension set. StarterKit provides headings, bold, italic,
 * strike, inline code, code block, blockquote, bullet/ordered lists, the
 * horizontal rule, paragraphs, and history. We add links, GFM task lists, a
 * placeholder, smart typography (em-dash + ellipsis only — ADR-0005), and the
 * Markdown serializer. Link clicks are handled by the view (Cmd-click → opener),
 * so `openOnClick` stays false.
 */
export function buildNoteExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Link.configure({ openOnClick: false, autolink: true }),
    TaskList,
    TaskItem.configure({ nested: false }),
    Placeholder.configure({ placeholder: NOTE_PLACEHOLDER }),
    // Smart punctuation, but only the portable transforms: em-dash and ellipsis.
    // Curly quotes are disabled so stored markdown stays plain/portable (ADR-0005).
    Typography.configure({
      openDoubleQuote: false,
      closeDoubleQuote: false,
      openSingleQuote: false,
      closeSingleQuote: false,
    }),
    Markdown.configure({
      html: false,
      tightLists: true,
      bulletListMarker: "-",
      linkify: true,
      breaks: false,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ];
}
