import { describe, expect, it } from "vitest";
import { unzip } from "./zip";
import { A_JSON, fromBase64, PLAIN_ZIP, ZIP64_ZIP } from "./zip.fixture";

const text = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : undefined);

describe("unzip", () => {
  it.each([["plain", PLAIN_ZIP], ["zip64", ZIP64_ZIP]])("reads deflated and stored files from a %s zip", async (_, zip) => {
    const files = await unzip(fromBase64(zip));
    const names = [...files.keys()].map((n) => n.normalize("NFC")).sort();
    expect(names).toEqual(["tasks/Café.json", "tasks/a.json", "tasks/b.json"]);
    expect(text(files.get("tasks/a.json"))).toBe(A_JSON);
    expect(text(files.get("tasks/b.json"))).toBe("b");
  });

  it("rejects what isn't a zip, and a zip cut short", async () => {
    await expect(unzip(new TextEncoder().encode("not a zip at all, honestly"))).rejects.toThrow("Not a zip");
    const zip = fromBase64(PLAIN_ZIP);
    await expect(unzip(zip.subarray(0, zip.length - 30))).rejects.toThrow();
  });
});
