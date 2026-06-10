/**
 * EditorToolbar — the formatting chrome for the note editor (docs/adr/0005).
 *
 * A sticky top toolbar (marks + block types + lists + link), a floating bubble
 * menu that appears on a text selection, and an inline link popover that
 * replaces the old window.prompt (opened from the toolbar/bubble Link button or
 * ⌘⇧K — ⌘K is the global palette). Link *opening* is handled in useNoteEditor
 * (Cmd-click → OS browser); this file only edits links.
 */

import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { BubbleMenu, type Editor } from "@tiptap/react";
import { Icon } from "@/components";

export interface EditorToolbarProps {
  editor: Editor | null;
  /** When provided, a trailing trash button deletes the note. Omitted by hosts
   *  (e.g. the goal drawer) that surface delete through their own menu. */
  onDelete?: () => void;
}

/** The full editor toolbar + bubble menu + link popover. */
export function EditorToolbar({ editor, onDelete }: EditorToolbarProps): JSX.Element {
  const [linkOpen, setLinkOpen] = useState(false);

  // ⌘⇧K opens the link popover while the editor is focused (⌘K is the palette).
  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k" && editor.isFocused) {
        e.preventDefault();
        setLinkOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editor]);

  const disabled = !editor;

  return (
    <div className="sticky top-0 z-10 flex items-center gap-0.5 bg-bg pb-3 pt-4">
      <ToolbarButton
        label="Bold"
        active={editor?.isActive("bold") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor?.isActive("italic") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <span className="font-serif italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        label="Heading"
        active={editor?.isActive("heading", { level: 2 }) ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <span className="text-[13.5px] font-semibold">H</span>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="Bullet list"
        active={editor?.isActive("bulletList") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <Icon name="listBullet" size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor?.isActive("orderedList") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <span className="text-[12px] font-semibold tabular-nums">1.</span>
      </ToolbarButton>
      <ToolbarButton
        label="Checklist"
        active={editor?.isActive("taskList") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      >
        <Icon name="check" size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor?.isActive("blockquote") ?? false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <Icon name="quote" size={15} />
      </ToolbarButton>
      <ToolbarButton
        label="Divider"
        active={false}
        disabled={disabled}
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
      >
        <Icon name="rule" size={15} />
      </ToolbarButton>

      <Divider />

      <div className="relative">
        <ToolbarButton
          label="Link (⌘⇧K)"
          active={editor?.isActive("link") ?? false}
          disabled={disabled}
          onClick={() => setLinkOpen((v) => !v)}
        >
          <Icon name="link" size={15} />
        </ToolbarButton>
        {linkOpen && editor && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
      </div>

      <span className="ml-auto flex items-center gap-3">
        <span className="text-[11.5px] italic text-ink-3">No markdown — just write</span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete note"
            title="Delete note"
            className="grid h-[30px] w-8 place-items-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-warn-soft hover:text-warn-ink"
          >
            <Icon name="trash" size={15} />
          </button>
        )}
      </span>

      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 120 }}
          shouldShow={({ editor: ed, from, to }) => from !== to && !ed.isActive("codeBlock")}
        >
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow">
            <BubbleButton
              label="Bold"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <span className="font-bold">B</span>
            </BubbleButton>
            <BubbleButton
              label="Italic"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <span className="font-serif italic">I</span>
            </BubbleButton>
            <BubbleButton
              label="Strikethrough"
              active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <span className="line-through">S</span>
            </BubbleButton>
            <BubbleButton
              label="Link"
              active={editor.isActive("link")}
              onClick={() => setLinkOpen(true)}
            >
              <Icon name="link" size={14} />
            </BubbleButton>
          </div>
        </BubbleMenu>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- link popover */

/** Inline add/edit/remove-link panel anchored under the toolbar Link button. */
function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }): JSX.Element {
  const [value, setValue] = useState<string>(
    () => (editor.getAttributes("link").href as string | undefined) ?? "",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const hasLink = editor.isActive("link");

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const apply = (): void => {
    const url = value.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url === "") chain.unsetLink().run();
    else chain.setLink({ href: url }).run();
    onClose();
  };

  const remove = (): void => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  };

  return (
    <div
      className="absolute right-0 top-full z-20 mt-1 flex w-72 items-center gap-1.5 rounded-lg border border-line bg-surface p-1.5 shadow"
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name="link" size={14} className="ml-1 text-ink-3" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
          if (e.key === "Escape") onClose();
        }}
        onBlur={apply}
        placeholder="https://…"
        className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
      />
      {hasLink && (
        <button
          type="button"
          // Use onMouseDown so it fires before the input's onBlur apply.
          onMouseDown={(e) => {
            e.preventDefault();
            remove();
          }}
          aria-label="Remove link"
          title="Remove link"
          className="grid h-6 w-6 flex-shrink-0 place-items-center rounded text-ink-3 transition-colors hover:bg-warn-soft hover:text-warn-ink"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- buttons */

interface ToolbarButtonProps {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** One toolbar control; reflects active mark/node state. */
function ToolbarButton({ label, active, disabled, onClick, children }: ToolbarButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-[30px] w-8 place-items-center rounded-md text-[14px] transition-colors duration-150 disabled:opacity-40 ${
        active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-raise"
      }`}
    >
      {children}
    </button>
  );
}

/** A bubble-menu control (smaller, on a surface card). */
function BubbleButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded text-[13px] transition-colors duration-150 ${
        active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-raise"
      }`}
    >
      {children}
    </button>
  );
}

/** A thin separator between toolbar groups. */
function Divider(): JSX.Element {
  return <span className="mx-1 h-5 w-px bg-line" />;
}
