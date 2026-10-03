import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { contentHash } from "@/sync/contentHash";
import { createIdbFiles, createMemoryFiles, type VaultTextFiles } from "./idbFiles";

const bytes = (s: string) => new TextEncoder().encode(s);
let n = 0;
const impls: Array<[string, () => VaultTextFiles]> = [
  ["memory", createMemoryFiles],
  ["indexeddb", () => createIdbFiles(`test-${n++}`)],
];

describe.each(impls)("%s files", (_name, make) => {
  it("write is compare-and-swap", async () => {
    const f = make();
    expect(await f.write("tasks/a.json", bytes("1"), "wrong")).toBe(false); // must not exist
    expect(await f.write("tasks/a.json", bytes("1"), null)).toBe(true);
    expect(await f.write("tasks/a.json", bytes("2"), null)).toBe(false); // exists now
    expect(await f.write("tasks/a.json", bytes("2"), await contentHash(bytes("1")))).toBe(true);
    expect(await f.write("tasks/a.json", bytes("3"), await contentHash(bytes("1")))).toBe(false); // stale
    expect(await f.readText("tasks/a.json")).toBe("2");
  });

  it("remove is compare-and-swap; list reports size and hash", async () => {
    const f = make();
    await f.writeText("Notes/B.md", "hello");
    expect(await f.list()).toEqual([{ path: "Notes/B.md", size: 5, contentHash: await contentHash(bytes("hello")) }]);
    expect(await f.remove("notes/b.md", "stale")).toBe(false);
    expect(await f.read("NOTES/b.md")).not.toBeNull(); // case-insensitive key
    expect(await f.remove("notes/b.md", await contentHash(bytes("hello")))).toBe(true);
    expect(await f.read("Notes/B.md")).toBeNull();
  });

  it("text helpers", async () => {
    const f = make();
    await f.writeText("tasks/x.json", "a");
    await f.writeText("tasks/x.json", "b"); // unconditional overwrite
    await f.writeText("goals/y.json", "c");
    expect(await f.listDir("tasks/")).toEqual(["tasks/x.json"]);
    expect(await f.removeFile("tasks/x.json")).toBe(true);
    expect(await f.removeFile("tasks/x.json")).toBe(false);
    expect(await f.readText("tasks/x.json")).toBeNull();
  });
});
