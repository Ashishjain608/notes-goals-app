/**
 * TipTap editor configuration for Notes — WYSIWYG in, GFM markdown out
 * (docs/adr/0005). Bodies are stored as Markdown; the editor never shows raw
 * syntax. Supported, round-trip-stable nodes only; Obsidian-specific syntax
 * (wikilinks, callouts, embeds) is intentionally NOT a node here. StarterKit's
 * paragraph node is swapped for `NoteParagraph`, which preserves blank
 * paragraphs across the markdown round-trip (see `BLANK_PARAGRAPH_MARKER`).
 */

import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
import Link, { type LinkOptions } from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { Markdown } from "tiptap-markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";

/** Faint prompt shown in an empty note body. */
export const NOTE_PLACEHOLDER = "Start writing…";

/**
 * The character markdown-it decodes `&nbsp;` to when re-parsing a note. A
 * paragraph containing only this character is our on-disk stand-in for a
 * genuinely empty paragraph (see `isBlankParagraphText`).
 */
const NBSP = "\u00A0";

/**
 * The literal markdown text written for a blank paragraph. `&nbsp;` survives
 * an empty-paragraph round-trip where a bare blank line would not: markdown
 * (and markdown-it on parse) treats blank lines as pure block separators, so
 * an empty TipTap paragraph — what you get from pressing Enter twice — has no
 * blank-line representation of its own and silently vanishes on reload
 * (docs/adr/0005, "blank line" amendment).
 */
const BLANK_PARAGRAPH_MARKER = "&nbsp;";

/**
 * True for a paragraph's text content that should serialize as the blank-line
 * marker: either genuinely empty (a fresh empty paragraph) or already just the
 * decoded marker (a paragraph reloaded from a previously-saved marker line).
 * Treating both cases alike is what makes the marker idempotent — reloading
 * and resaving a marker line reproduces the same `&nbsp;`, never a raw NBSP
 * byte.
 */
export function isBlankParagraphText(text: string): boolean {
  return text === "" || text === NBSP;
}

/**
 * Markdown serializer for the paragraph node: blank paragraphs write the
 * `&nbsp;` marker instead of nothing, everything else serializes exactly like
 * `prosemirror-markdown`'s default paragraph (render inline content, close
 * the block).
 */
function serializeParagraph(state: MarkdownSerializerState, node: ProseMirrorNode): void {
  if (isBlankParagraphText(node.textContent)) {
    state.write(BLANK_PARAGRAPH_MARKER);
    state.closeBlock(node);
    return;
  }
  state.renderInline(node);
  state.closeBlock(node);
}

/**
 * StarterKit's paragraph node with the markdown serializer above attached.
 * Parsing needs no override: markdown-it already decodes `&nbsp;` to NBSP
 * text, and the default HTML-`<p>`-to-node parse handles the rest.
 */
const NoteParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize: serializeParagraph,
        parse: {
          // handled by markdown-it
        },
      },
    };
  },
});

/**
 * Let a vault-relative attachment link (`attachments/<noteId>/<file>`, no
 * scheme) through the Link extension's XSS allow-list, which otherwise only
 * accepts http(s)/mailto/etc — see @tiptap/extension-link's `isAllowedUri`
 * default. Everything else keeps the extension's stock (`defaultValidate`)
 * behavior, so this narrows nothing else.
 */
export const isAllowedLinkUri: LinkOptions["isAllowedUri"] = (url, ctx) =>
  url.startsWith("attachments/") || ctx.defaultValidate(url);

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
      paragraph: false, // replaced by NoteParagraph below (blank-line marker)
    }),
    NoteParagraph,
    Link.configure({ openOnClick: false, autolink: true, isAllowedUri: isAllowedLinkUri }),
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
