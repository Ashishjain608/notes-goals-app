import { describe, expect, it } from "vitest";
import { extensionForMime, fileBytes, pastedFileName } from "./attachments";

describe("extensionForMime", () => {
  it("knows the common pasted-image types", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/gif")).toBe("gif");
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(extensionForMime("image/svg+xml")).toBe("svg");
  });

  it("falls back to the MIME subtype for anything else", () => {
    expect(extensionForMime("application/pdf")).toBe("pdf");
  });

  it("falls back to bin for a shapeless/empty MIME type", () => {
    expect(extensionForMime("")).toBe("bin");
  });
});

describe("pastedFileName", () => {
  it("uses the file's own name when it has one", () => {
    const file = new File([new Uint8Array([1])], "screenshot.png", { type: "image/png" });
    expect(pastedFileName(file)).toBe("screenshot.png");
  });

  it("trims a whitespace-only name and falls back to a timestamped placeholder", () => {
    const file = new File([new Uint8Array([1])], "  ", { type: "image/jpeg" });
    expect(pastedFileName(file, 1_700_000_000_000)).toBe("pasted-1700000000000.jpg");
  });
});

describe("fileBytes", () => {
  it("reads a File's bytes as a plain number array", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.bin");
    expect(await fileBytes(file)).toEqual([1, 2, 3]);
  });
});
