/**
 * AttachmentList — read-only presentational list of a task's or note's file
 * attachments.
 *
 * Props-only, no store/IPC: the caller supplies the data and the open/remove
 * callbacks. Renders a wrapping row of compact file chips — a file-type icon,
 * the truncated name, and the size — so the list reads as dense cards rather
 * than sparse full-width rows, and wraps sensibly in both a narrow task
 * drawer and a wide note editor. Clicking a chip's name opens the file; the
 * trailing control removes it. Image previews are out of scope (Tauri's
 * asset protocol needs a runtime-scoped vault) — image files just get a
 * distinct icon.
 */
import type { JSX } from "react";
import type { Attachment } from "@/types";
import { formatShortDate } from "@/lib/dates";
import { Icon, type IconName } from "./Icon";

export interface AttachmentListProps {
  attachments: Attachment[];
  /** Called when the user clicks an attachment's name. */
  onOpen: (attachment: Attachment) => void;
  /** Called when the user clicks an attachment's remove control. */
  onRemove: (attachment: Attachment) => void;
}

/** Broad file-type buckets used to pick a representative icon. */
type AttachmentKind = "pdf" | "image" | "spreadsheet" | "archive" | "document";

const EXTENSION_KIND: Record<string, AttachmentKind> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  heic: "image",
  svg: "image",
  bmp: "image",
  tiff: "image",
  csv: "spreadsheet",
  tsv: "spreadsheet",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  numbers: "spreadsheet",
  zip: "archive",
  tar: "archive",
  gz: "archive",
  rar: "archive",
  "7z": "archive",
};

const KIND_ICON: Record<AttachmentKind, IconName> = {
  pdf: "filePdf",
  image: "fileImage",
  spreadsheet: "fileSheet",
  archive: "fileArchive",
  document: "notes",
};

/**
 * Classify a filename's extension into a broad kind, defaulting to
 * "document" for no extension, a trailing dot, or an unrecognized extension.
 */
export function attachmentKind(name: string): AttachmentKind {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "document";
  const ext = name.slice(dot + 1).toLowerCase();
  return EXTENSION_KIND[ext] ?? "document";
}

/** Map a filename to the icon that best represents its file type. */
export function attachmentIcon(name: string): IconName {
  return KIND_ICON[attachmentKind(name)];
}

/** Format a byte count as a short human-readable size ("0 B", "1.5 KB", "2.3 MB"). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Render the current attachments as wrapping file chips, or nothing when there are none. */
export function AttachmentList({ attachments, onOpen, onRemove }: AttachmentListProps): JSX.Element | null {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <div
          key={attachment.path}
          className="flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1 pl-2 pr-1 transition-colors duration-100 hover:border-line-2"
        >
          <span className="shrink-0 text-ink-3">
            <Icon name={attachmentIcon(attachment.name)} size={15} />
          </span>
          <button
            type="button"
            onClick={() => onOpen(attachment)}
            title={`${attachment.name} · ${formatFileSize(attachment.size)} · ${formatShortDate(attachment.added)}`}
            className="min-w-0 max-w-[200px] truncate text-left text-[12.5px] text-ink hover:text-accent-ink hover:underline"
          >
            {attachment.name}
          </button>
          <span className="shrink-0 text-[11px] tabular-nums text-ink-3">{formatFileSize(attachment.size)}</span>
          <button
            type="button"
            onClick={() => onRemove(attachment)}
            aria-label={`Remove ${attachment.name}`}
            title="Remove attachment — the file moves to the vault's trash"
            className="shrink-0 rounded-md p-1 text-ink-3 transition-colors duration-100 hover:bg-raise hover:text-accent-ink"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
