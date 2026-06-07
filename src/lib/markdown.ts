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
import { Markdown } from "tiptap-markdown";

/**
 * The note editor's extension set. StarterKit provides headings, bold, italic,
 * strike, inline code, code block, blockquote, bullet/ordered lists, paragraphs,
 * and history. We add links, GFM task lists, and the Markdown serializer.
 */
export function buildNoteExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Link.configure({ openOnClick: false, autolink: true }),
    TaskList,
    TaskItem.configure({ nested: false }),
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
