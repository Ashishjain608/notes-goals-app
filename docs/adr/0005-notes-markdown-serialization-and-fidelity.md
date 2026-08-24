# Notes: WYSIWYG editing, Markdown storage, and a deliberate fidelity ceiling

Notes are authored WYSIWYG in TipTap (ProseMirror) but stored as Markdown with YAML frontmatter. TipTap has no native Markdown I/O, so we adopt the **`tiptap-markdown`** extension (markdown-it under the hood) for both parse and serialize, targeting **GitHub-Flavored Markdown** (GFM) so task-list checkboxes (`- [ ]`) and strikethrough stay readable in other markdown tools.

**Supported, round-trip-stable feature set:** headings (H1–H3), paragraphs, bold, italic, strikethrough, inline code, bullet + ordered lists, task-list checkboxes, blockquote, code block, horizontal rule (`---`), links. Images, tables, and embeds are deferred past v1.

**Smart-typography input transforms (amended):** as you type, `--` becomes an em-dash (—) and `...` becomes an ellipsis (…). These are the only auto-substitutions; curly/smart quotes are **deliberately disabled** so the stored markdown stays plain ASCII and portable. The transforms run on input only (they edit the literal characters that get serialized), so a note containing — or … round-trips as those characters, which is within GFM.

**Deliberate fidelity ceiling:** round-trip is guaranteed *only* for the supported set. Obsidian-specific syntax — `[[wikilinks]]`, `#tags`, callouts, embeds — is not a recognized node and is preserved as plain text at best, not rendered. **This app is not a general Obsidian replacement for arbitrary markdown**; it round-trips its own feature set faithfully. The frontmatter stays Obsidian-compatible; the body is "our markdown."

The note title lives in frontmatter only — the body never repeats it as an H1. Saves are debounced (~800ms) autosaves flushed on blur/navigation/quit; each bumps `updated` and never touches `created`.

**Blank-line marker (amendment):** pressing Enter twice creates an empty TipTap paragraph, and `prosemirror-markdown`'s default paragraph serializer writes nothing for it — once serialized, that blank line is indistinguishable from no paragraph at all, and markdown-it drops it for good on the next parse. To keep the editor faithful to what was typed, an empty paragraph now serializes as a line containing `&nbsp;` instead of a bare blank line; on reload markdown-it decodes that back to a single NBSP character, and the paragraph serializer treats an NBSP-only paragraph the same as an empty one, so the marker reproduces itself unchanged on every subsequent save rather than degrading into a raw NBSP byte. This is a deliberate, narrow exception to "plain portable markdown": the marker is still a normal HTML entity any markdown renderer understands, it only appears on otherwise-blank lines, and it never touches code blocks (a blank line inside a fenced block stays a literal blank line, since code content isn't run through the paragraph serializer at all).

## Why record this

`tiptap-markdown` + GFM is a tech choice with editor lock-in, and the fidelity ceiling is a scope boundary that will surprise a future "why doesn't my wikilink work?" reader. Both are expensive to reverse once notes exist on disk in this dialect.

## Considered Options

- **Hand-wire `prosemirror-markdown`** — more control, more work, same outcome for our feature set. Rejected for v1.
- **Store raw ProseMirror JSON instead of Markdown** — perfect round-trip, but breaks the portability/human-readability requirement (§5 of the brief). Rejected outright.
