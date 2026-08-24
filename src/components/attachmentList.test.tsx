// @vitest-environment node
// Same pattern as components.test.tsx: renderToStaticMarkup needs no DOM.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Attachment } from "@/types";
import { AttachmentList, attachmentIcon, attachmentKind, formatFileSize } from "./AttachmentList";

function attachment(over: Partial<Attachment> = {}): Attachment {
  return {
    path: "attachments/t1/report.pdf",
    name: "report.pdf",
    size: 2048,
    added: "2026-06-07T12:00:00Z",
    ...over,
  };
}

describe("formatFileSize", () => {
  it("formats zero and sub-KB byte counts", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(500)).toBe("500 B");
  });
  it("formats the KB boundary and above", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });
  it("formats the MB boundary and above", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});

describe("attachmentKind / attachmentIcon", () => {
  it("maps common extensions to their kind and icon", () => {
    expect(attachmentKind("report.pdf")).toBe("pdf");
    expect(attachmentIcon("report.pdf")).toBe("filePdf");
    expect(attachmentKind("photo.png")).toBe("image");
    expect(attachmentIcon("photo.png")).toBe("fileImage");
    expect(attachmentKind("budget.xlsx")).toBe("spreadsheet");
    expect(attachmentIcon("budget.xlsx")).toBe("fileSheet");
    expect(attachmentKind("backup.zip")).toBe("archive");
    expect(attachmentIcon("backup.zip")).toBe("fileArchive");
  });

  it("is case-insensitive on the extension", () => {
    expect(attachmentKind("REPORT.PDF")).toBe("pdf");
    expect(attachmentKind("Photo.JPG")).toBe("image");
  });

  it("uses the last extension in a filename with several dots", () => {
    expect(attachmentKind("archive.tar.gz")).toBe("archive");
    expect(attachmentKind("notes.v2.final.docx")).toBe("document");
  });

  it("falls back to document for an unknown extension", () => {
    expect(attachmentKind("data.xyz")).toBe("document");
  });

  it("falls back to document when there is no extension", () => {
    expect(attachmentKind("README")).toBe("document");
    expect(attachmentKind(".gitignore")).toBe("document");
    expect(attachmentKind("trailing.")).toBe("document");
  });
});

describe("AttachmentList", () => {
  it("returns nothing for an empty list", () => {
    expect(
      renderToStaticMarkup(<AttachmentList attachments={[]} onOpen={() => {}} onRemove={() => {}} />),
    ).toBe("");
  });

  it("renders the filename and formatted size for each attachment", () => {
    const html = renderToStaticMarkup(
      <AttachmentList attachments={[attachment()]} onOpen={() => {}} onRemove={() => {}} />,
    );
    expect(html).toContain("report.pdf");
    expect(html).toContain("2.0 KB");
  });

  it("renders one row per attachment", () => {
    const html = renderToStaticMarkup(
      <AttachmentList
        attachments={[attachment({ path: "a", name: "a.png" }), attachment({ path: "b", name: "b.png" })]}
        onOpen={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(html).toContain("a.png");
    expect(html).toContain("b.png");
  });
});
