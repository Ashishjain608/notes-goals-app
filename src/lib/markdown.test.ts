/**
 * Tests for the blank-paragraph markdown fix (notes-goals-app-f36): pressing
 * Enter twice in the note editor creates an empty TipTap paragraph, which the
 * default markdown serializer writes as nothing — indistinguishable, once
 * serialized, from no paragraph at all. `isBlankParagraphText` plus the
 * `NoteParagraph` serializer (src/lib/markdown.ts) fix that by writing a
 * `&nbsp;` marker instead.
 *
 * These tests exercise the exact serializer logic against real
 * `prosemirror-markdown` docs (via `@tiptap/pm/markdown`, a re-export of
 * `prosemirror-markdown` shipped inside the already-declared `@tiptap/pm`
 * dependency) rather than a live TipTap editor — vitest runs with no DOM here
 * (vitest.config.ts sets `environment: "node"`), so a live editor can't be
 * instantiated.
 */

import { describe, expect, it } from "vitest";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  MarkdownSerializer,
  type MarkdownSerializerState,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  schema,
} from "@tiptap/pm/markdown";
import { isAllowedUri } from "@tiptap/extension-link";
import { isAllowedLinkUri, isBlankParagraphText } from "./markdown";

// Mirrors NoteParagraph's `serialize` in markdown.ts exactly, built on the
// same exported predicate — this is the one place the test duplicates a few
// lines of glue rather than reaching into a live TipTap editor for them.
function serializeParagraph(state: MarkdownSerializerState, node: ProseMirrorNode): void {
  if (isBlankParagraphText(node.textContent)) {
    state.write("&nbsp;");
    state.closeBlock(node);
    return;
  }
  state.renderInline(node);
  state.closeBlock(node);
}

const testSerializer = new MarkdownSerializer(
  { ...defaultMarkdownSerializer.nodes, paragraph: serializeParagraph },
  defaultMarkdownSerializer.marks,
);

/** Parse markdown → doc → markdown through the blank-aware serializer. */
function roundTrip(markdown: string): string {
  return testSerializer.serialize(defaultMarkdownParser.parse(markdown));
}

const { paragraph: p, bullet_list: bulletList, list_item: listItem, blockquote } = schema.nodes;

describe("isBlankParagraphText", () => {
  it("is true for empty text", () => {
    expect(isBlankParagraphText("")).toBe(true);
  });
  it("is true for a single decoded NBSP", () => {
    expect(isBlankParagraphText("\u00A0")).toBe(true);
  });
  it("is false for real content", () => {
    expect(isBlankParagraphText("hello")).toBe(false);
  });
  it("is false for content merely containing an NBSP alongside other text", () => {
    expect(isBlankParagraphText("\u00A0hello")).toBe(false);
  });
  it("is false for an ordinary ASCII space (not the marker)", () => {
    expect(isBlankParagraphText(" ")).toBe(false);
  });
});

describe("blank paragraph serialization", () => {
  it("writes the &nbsp; marker for a single blank line between paragraphs", () => {
    const doc = schema.node("doc", null, [
      p.create(null, schema.text("Above")),
      p.create(),
      p.create(null, schema.text("Below")),
    ]);
    expect(testSerializer.serialize(doc)).toBe("Above\n\n&nbsp;\n\nBelow");
  });

  it("keeps several consecutive blank paragraphs distinct", () => {
    const doc = schema.node("doc", null, [
      p.create(null, schema.text("Above")),
      p.create(),
      p.create(),
      p.create(),
      p.create(null, schema.text("Below")),
    ]);
    expect(testSerializer.serialize(doc)).toBe("Above\n\n&nbsp;\n\n&nbsp;\n\n&nbsp;\n\nBelow");
  });

  it("preserves a blank paragraph at the end of the note", () => {
    const doc = schema.node("doc", null, [p.create(null, schema.text("Last line")), p.create()]);
    expect(testSerializer.serialize(doc)).toBe("Last line\n\n&nbsp;");
  });

  it("preserves a blank paragraph inside a blockquote", () => {
    const doc = schema.node("doc", null, [
      blockquote.create(null, [p.create(null, schema.text("Quoted")), p.create()]),
    ]);
    expect(testSerializer.serialize(doc)).toBe("> Quoted\n>\n> &nbsp;");
  });

  it("preserves a blank paragraph inside a list item without breaking the list", () => {
    const doc = schema.node("doc", null, [
      bulletList.create(null, [
        listItem.create(null, [p.create(null, schema.text("Item one")), p.create()]),
        listItem.create(null, [p.create(null, schema.text("Item two"))]),
      ]),
    ]);
    expect(testSerializer.serialize(doc)).toBe("* Item one\n\n  &nbsp;\n\n* Item two");
  });

  it("does not touch a plain blank-line separator between two real paragraphs", () => {
    expect(roundTrip("A\n\nB")).toBe("A\n\nB");
  });

  it("leaves a blank line inside a fenced code block completely untouched", () => {
    const markdown = "before\n\n```\nline1\n\nline2\n```\n\nafter";
    expect(roundTrip(markdown)).toBe(markdown);
  });
});

describe("idempotent round-tripping (save twice, reload twice → no drift)", () => {
  it("is a fixed point for a single blank line", () => {
    const once = roundTrip("A\n\n&nbsp;\n\nB");
    const twice = roundTrip(once);
    expect(twice).toBe(once);
    expect(once).toBe("A\n\n&nbsp;\n\nB");
  });

  it("is a fixed point starting from freshly-typed empty paragraphs (not yet round-tripped)", () => {
    const doc = schema.node("doc", null, [
      p.create(null, schema.text("A")),
      p.create(),
      p.create(),
      p.create(null, schema.text("B")),
      p.create(),
    ]);
    const firstSave = testSerializer.serialize(doc);
    const secondSave = testSerializer.serialize(defaultMarkdownParser.parse(firstSave));
    expect(secondSave).toBe(firstSave);

    // A third cycle must not drift or accumulate characters either.
    const thirdSave = testSerializer.serialize(defaultMarkdownParser.parse(secondSave));
    expect(thirdSave).toBe(secondSave);
  });

  it("is a fixed point for a blank line inside a list", () => {
    const once = roundTrip("* Item one\n\n  &nbsp;\n\n* Item two");
    expect(roundTrip(once)).toBe(once);
  });
});

// Tests for notes-goals-app-3i5 (note attachment links): a note attachment is
// just an inline markdown link `[name](attachments/<noteId>/<file>)`. TipTap's
// Link extension (@tiptap/extension-link) validates hrefs against an XSS
// allow-list that only covers http(s)/mailto/etc schemes and rejects a
// scheme-less relative path like ours outright — `isAllowedLinkUri` (the
// `Link.configure({ isAllowedUri })` in markdown.ts) is the fix. These tests
// prove it two ways: the validation function itself accepts our link shape
// and still rejects dangerous schemes exactly like the stock extension, and
// the markdown text produced/consumed for such a link is a stable round trip
// through the same `prosemirror-markdown` primitives the app's serializer is
// built on (real DOM-based TipTap parsing needs a browser and isn't available
// under vitest's node environment — see the file header above).
describe("isAllowedLinkUri (attachment link hrefs past the Link XSS gate)", () => {
  const defaultValidate = (url: string): boolean => !!isAllowedUri(url, []);
  const ctx = { defaultValidate, protocols: [], defaultProtocol: "http" };

  it("allows a vault-relative attachment path", () => {
    expect(isAllowedLinkUri("attachments/note-1/report.pdf", ctx)).toBe(true);
  });

  it("allows an attachment path with spaces and parens in the filename", () => {
    expect(
      isAllowedLinkUri("attachments/note-1/My File (1).png", ctx),
    ).toBe(true);
  });

  it("still defers ordinary http(s)/mailto links to the default validator", () => {
    expect(isAllowedLinkUri("https://example.com", ctx)).toBe(true);
    expect(isAllowedLinkUri("mailto:a@b.com", ctx)).toBe(true);
  });

  it("still rejects a dangerous scheme the default validator rejects", () => {
    expect(isAllowedLinkUri("javascript:alert(1)", ctx)).toBe(false);
    expect(isAllowedLinkUri("data:text/html;base64,xxx", ctx)).toBe(false);
  });
});

describe("attachment link markdown round-trip", () => {
  it("is a fixed point for a relative attachments/ link", () => {
    const markdown = "[report.pdf](attachments/note-1/report.pdf)";
    expect(roundTrip(markdown)).toBe(markdown);
    expect(roundTrip(roundTrip(markdown))).toBe(markdown);
  });

  // A bare (non-angle-bracketed) markdown link destination can't contain a raw
  // space at all (CommonMark) — prosemirror-markdown's serializer backslash-
  // escapes `()"` in an href but never adds `<...>` or escapes spaces, so a
  // filename with a space — the common case for a pasted screenshot or a
  // user-picked file — silently stops parsing as a link on the very next
  // reload. This is why both insertion sites (EditorToolbar's handleAttach and
  // useNoteEditor's attachPastedFile) `encodeURI` the path before handing it to
  // the Link mark: encoding removes the space (→ `%20`) while leaving `/`
  // alone, and the existing paren-escaping still covers the rest.
  it("documents that an unencoded space in the href breaks the link on reload", () => {
    const doc = defaultMarkdownParser.parse("[My File (1).png](attachments/note-1/My File (1).png)");
    let hasLink = false;
    doc.descendants((node) => {
      if (node.marks.some((m) => m.type.name === "link")) hasLink = true;
    });
    expect(hasLink).toBe(false); // confirms the failure mode `encodeURI` avoids
  });

  it("preserves the href and link text through parse → serialize once encodeURI'd", () => {
    const markdown = "[My File (1).png](attachments/note-1/My%20File%20\\(1\\).png)";
    const doc = defaultMarkdownParser.parse(markdown);
    let href: string | undefined;
    doc.descendants((node) => {
      href ??= node.marks.find((m) => m.type.name === "link")?.attrs.href as string | undefined;
    });
    expect(href).toBe("attachments/note-1/My%20File%20(1).png");
    expect(decodeURI(href ?? "")).toBe("attachments/note-1/My File (1).png");
    expect(testSerializer.serialize(doc)).toBe(markdown);
    expect(roundTrip(markdown)).toBe(markdown);
  });
});
