/**
 * FormatPill — the phone editor's formatting bar, a glass pill floating above
 * the keyboard (ADR-0012). Aa cycles body/H1/H2; B, I, bullets, checklist, link;
 * ⌄ hides the keyboard. Every button swallows pointerdown so a tap never blurs
 * the editor (which would drop the keyboard). No attach button (ADR-0011).
 */
import { useState, type JSX, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { Icon } from "@/components";
import { cycleHeading, LinkPopover } from "./EditorToolbar";

/** Pill height in px (h-12); the editor scroller pads by this plus the keyboard inset. */
export const FORMAT_PILL_HEIGHT = 48;
/** Gap between the pill and the keyboard / safe area. */
export const FORMAT_PILL_GAP = 8;

function PillButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-11 min-w-0 flex-1 place-items-center rounded-[20px] text-[16px] ${
        active ? "bg-accent-soft text-accent-ink" : "text-ink-2 active:bg-raise"
      }`}
    >
      {children}
    </button>
  );
}

export function FormatPill({ editor, inset }: { editor: Editor | null; inset: number }): JSX.Element {
  const [linkOpen, setLinkOpen] = useState(false);
  const run = (fn: (chain: ReturnType<Editor["chain"]>) => void) => (): void => {
    if (editor) fn(editor.chain().focus());
  };
  const heading = editor?.isActive("heading") ?? false;
  return (
    <div
      className="fixed inset-x-3 z-30"
      style={{ bottom: inset > 0 ? inset + FORMAT_PILL_GAP : `calc(${FORMAT_PILL_GAP}px + env(safe-area-inset-bottom))` }}
    >
      {linkOpen && editor && (
        <LinkPopover
          editor={editor}
          onClose={() => setLinkOpen(false)}
          className="absolute inset-x-0 bottom-full mb-2 flex items-center gap-1.5 rounded-2xl border border-line bg-surface p-2 shadow-glass"
        />
      )}
      <div
        role="toolbar"
        aria-label="Format"
        style={{ height: FORMAT_PILL_HEIGHT }}
        className="flex items-center gap-0.5 rounded-[24px] bg-glass px-1 shadow-glass backdrop-blur-[20px]"
      >
        <PillButton label="Heading" active={heading} onClick={() => editor && cycleHeading(editor)}>
          <span className="font-semibold">Aa</span>
        </PillButton>
        <PillButton label="Bold" active={editor?.isActive("bold") ?? false} onClick={run((c) => c.toggleBold().run())}>
          <span className="font-bold">B</span>
        </PillButton>
        <PillButton label="Italic" active={editor?.isActive("italic") ?? false} onClick={run((c) => c.toggleItalic().run())}>
          <span className="font-serif italic">I</span>
        </PillButton>
        <PillButton label="Bullet list" active={editor?.isActive("bulletList") ?? false} onClick={run((c) => c.toggleBulletList().run())}>
          <Icon name="listBullet" size={20} />
        </PillButton>
        <PillButton label="Checklist" active={editor?.isActive("taskList") ?? false} onClick={run((c) => c.toggleTaskList().run())}>
          <Icon name="check" size={20} />
        </PillButton>
        <PillButton label="Link" active={editor?.isActive("link") ?? false} onClick={() => setLinkOpen((v) => !v)}>
          <Icon name="link" size={20} />
        </PillButton>
        <PillButton label="Hide keyboard" onClick={() => (document.activeElement as HTMLElement | null)?.blur()}>
          <Icon name="chevronDown" size={20} />
        </PillButton>
      </div>
    </div>
  );
}
