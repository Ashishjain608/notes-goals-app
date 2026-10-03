/** Tests for plan() (every rule) and syncOnce() against in-memory files and a fake remote. */
import { describe, expect, it } from "vitest";
import { conflictPath, plan, syncOnce } from "./engine";
import {
  RemoteConflictError, type BaseEntry, type LocalEntry, type Remote, type RemoteEntry, type SyncState, type VaultFiles,
} from "./types";

const all = () => true;
const L = (path: string, contentHash: string): LocalEntry => ({ path, size: 1, contentHash });
const R = (path: string, contentHash: string, rev = `rev-${contentHash}`): RemoteEntry => ({ path, size: 1, contentHash, rev });
const B = (path: string, contentHash: string, rev = `rev-${contentHash}`): BaseEntry => ({ path, contentHash, rev });
const baseOf = (...e: BaseEntry[]) => Object.fromEntries(e.map((b) => [b.path.toLowerCase(), b]));
const NOW = new Date("2026-10-03T09:08:07.123Z");
const run = (l: LocalEntry[], r: RemoteEntry[], b: BaseEntry[]) =>
  plan(l, r, baseOf(...b), all, { deviceName: "mac", now: NOW });

describe("plan rules", () => {
  it("1: equal sides transfer nothing, record base when missing or stale", () => {
    expect(run([L("a", "h")], [R("a", "h")], [B("a", "h")])).toEqual([]);
    expect(run([L("a", "h")], [R("a", "h", "r2")], [B("a", "h", "r1")])).toEqual([
      { kind: "record", key: "a", entry: { path: "a", contentHash: "h", rev: "r2" } },
    ]);
    expect(run([L("a", "h")], [R("a", "h")], [])).toHaveLength(1);
  });
  it("2: local only, no base, uploads as add", () => {
    expect(run([L("a", "h")], [], [])).toEqual([{ kind: "upload", path: "a", rev: null }]);
  });
  it("3: remote only, no base, downloads", () => {
    expect(run([], [R("a", "h")], [])).toEqual([{ kind: "download", path: "a", expectedHash: null }]);
  });
  it("4: local changed uploads with the base rev", () => {
    expect(run([L("a", "new")], [R("a", "old")], [B("a", "old")])).toEqual([{ kind: "upload", path: "a", rev: "rev-old" }]);
  });
  it("5: remote changed downloads guarded by the local hash", () => {
    expect(run([L("a", "old")], [R("a", "new")], [B("a", "old")])).toEqual([{ kind: "download", path: "a", expectedHash: "old" }]);
  });
  it("6: local delete removes remote with the base rev", () => {
    expect(run([], [R("a", "h")], [B("a", "h")])).toEqual([{ kind: "deleteRemote", path: "a", rev: "rev-h" }]);
  });
  it("7: remote delete removes local guarded by hash", () => {
    expect(run([L("a", "h")], [], [B("a", "h")])).toEqual([{ kind: "deleteLocal", path: "a", expectedHash: "h" }]);
  });
  it("8: gone on both sides drops the base", () => {
    expect(run([], [], [B("a", "h")])).toEqual([{ kind: "dropBase", key: "a" }]);
  });
  it("9: divergent edits (or no base) conflict into .atlas/conflicts", () => {
    const expected = [{
      kind: "conflict", path: "tasks/a.json", expectedHash: "l",
      copyPath: ".atlas/conflicts/tasks/a.mac-20261003T090807Z.json",
    }];
    expect(run([L("tasks/a.json", "l")], [R("tasks/a.json", "r")], [B("tasks/a.json", "b")])).toEqual(expected);
    expect(run([L("tasks/a.json", "l")], [R("tasks/a.json", "r")], [])).toEqual(expected);
  });
  it("10: edit beats delete in both directions", () => {
    expect(run([L("a", "new")], [], [B("a", "old")])).toEqual([{ kind: "upload", path: "a", rev: null }]);
    expect(run([], [R("a", "new")], [B("a", "old")])).toEqual([{ kind: "download", path: "a", expectedHash: null }]);
  });
  it("leaves a file evicted to iCloud alone: no delete, no download over it", () => {
    const gone = { ...L("tasks/a.json", ""), unavailable: true };
    expect(run([gone], [R("tasks/a.json", "h")], [B("tasks/a.json", "h")])).toEqual([]);
    expect(run([gone], [R("tasks/a.json", "new")], [B("tasks/a.json", "old")])).toEqual([]);
  });
  it("keys are case-insensitive", () => {
    expect(run([L("Tasks/A.json", "h")], [R("tasks/a.json", "h")], [B("tasks/a.json", "h", "rev-h")])).toEqual([]);
  });
  it("conflictPath handles root files and no extension", () => {
    expect(conflictPath("a.json", "my mac", NOW)).toBe(".atlas/conflicts/a.my-mac-20261003T090807Z.json");
    expect(conflictPath("d/README", "m", NOW)).toBe(".atlas/conflicts/d/README.m-20261003T090807Z");
  });
});

describe("mass-delete guard", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `tasks/${i}.json`);
  it("holds local deletes when > 10 and > 50% of base", () => {
    const paths = many(12);
    const actions = run(paths.map((p) => L(p, "h")), [], paths.map((p) => B(p, "h")));
    expect(actions.every((a) => a.kind === "held")).toBe(true);
  });
  it("holds remote deletes likewise", () => {
    const paths = many(12);
    const actions = run([], paths.map((p) => R(p, "h")), paths.map((p) => B(p, "h")));
    expect(actions.every((a) => a.kind === "held")).toBe(true);
  });
  it("lets deletes through at 10 or when under half the base", () => {
    const ten = many(10);
    expect(run(ten.map((p) => L(p, "h")), [], ten.map((p) => B(p, "h"))).every((a) => a.kind === "deleteLocal")).toBe(true);
    const keep = many(30);
    const l = keep.slice(11).map((p) => L(p, "h"));
    const r = keep.slice(11).map((p) => R(p, "h"));
    const actions = run([...l, ...keep.slice(0, 11).map((p) => L(p, "h"))], r, keep.map((p) => B(p, "h")));
    expect(actions.filter((a) => a.kind === "deleteLocal")).toHaveLength(11);
  });
});

/** In-memory vault and remote. */
class MemFiles implements VaultFiles {
  data = new Map<string, { bytes: Uint8Array; hash: string }>();
  put(path: string, text: string, hash = text) { this.data.set(path, { bytes: new TextEncoder().encode(text), hash }); }
  text(path: string) { const d = this.data.get(path); return d ? new TextDecoder().decode(d.bytes) : null; }
  casMiss = new Set<string>();
  async list() { return [...this.data].map(([path, d]) => L(path, d.hash)); }
  async read(path: string) { return this.data.get(path)?.bytes ?? null; }
  async write(path: string, bytes: Uint8Array, expected: string | null) {
    if (this.casMiss.has(path) || (this.data.get(path)?.hash ?? null) !== expected) return false;
    const text = new TextDecoder().decode(bytes);
    this.data.set(path, { bytes, hash: text });
    return true;
  }
  async remove(path: string, expected: string) {
    if (this.data.get(path)?.hash !== expected) return false;
    this.data.delete(path);
    return true;
  }
}

class FakeRemote implements Remote {
  files = new Map<string, { text: string; rev: string }>();
  n = 0;
  stale = new Set<string>();
  log: string[] = [];
  put(path: string, text: string) { this.files.set(path, { text, rev: `r${++this.n}` }); }
  private entry(path: string): RemoteEntry { const f = this.files.get(path)!; return { path, rev: f.rev, size: 1, contentHash: f.text }; }
  async listAll() { return [...this.files.keys()].map((p) => this.entry(p)); }
  downloads = 0;
  zips: string[] = [];
  async download(path: string) { this.downloads++; return { bytes: new TextEncoder().encode(this.files.get(path)!.text), entry: this.entry(path) }; }
  async downloadFolder(folder: string) {
    this.zips.push(folder);
    const inside = [...this.files].filter(([p]) => p.startsWith(`${folder}/`));
    return new Map(inside.map(([p, f]) => [p.toLowerCase(), { bytes: new TextEncoder().encode(f.text), contentHash: f.text }]));
  }
  async upload(path: string, bytes: Uint8Array, rev: string | null | "overwrite") {
    this.log.push(`upload ${path} ${rev}`);
    if (this.stale.has(path)) throw new RemoteConflictError(path);
    this.put(path, new TextDecoder().decode(bytes));
    return this.entry(path);
  }
  async remove(path: string, rev: string) {
    this.log.push(`remove ${path} ${rev}`);
    if (this.stale.has(path)) throw new RemoteConflictError(path);
    this.files.delete(path);
  }
}

function harness(base: BaseEntry[] = [], include: (p: string) => boolean = all) {
  const files = new MemFiles();
  const remote = new FakeRemote();
  const saved: SyncState[] = [];
  let state: SyncState = { files: baseOf(...base) };
  const sync = () => syncOnce({
    files, remote, include, deviceName: "mac", now: () => NOW,
    state: { load: async () => state, save: async (s) => { state = s; saved.push(structuredClone(s)); } },
  });
  return { files, remote, sync, saved, state: () => state };
}

describe("syncOnce", () => {
  it("uploads, downloads, and records base entries", async () => {
    const h = harness();
    h.files.put("tasks/up.json", "u");
    h.remote.put("tasks/down.json", "d");
    const res = await h.sync();
    expect(res).toMatchObject({ uploaded: 1, downloaded: 1 });
    expect(h.remote.files.get("tasks/up.json")?.text).toBe("u");
    expect(h.files.text("tasks/down.json")).toBe("d");
    expect(Object.keys(h.state().files).sort()).toEqual(["tasks/down.json", "tasks/up.json"]);
    expect(h.state().files["tasks/up.json"]!.rev).toBe(h.remote.files.get("tasks/up.json")?.rev);
    expect(h.state().files["tasks/down.json"]!.contentHash).toBe("d");
    // second run is a no-op
    expect(await h.sync()).toMatchObject({ uploaded: 0, downloaded: 0 });
  });

  it("propagates deletes both ways and clears base", async () => {
    const h = harness([B("tasks/a.json", "a", "r0"), B("tasks/b.json", "b", "r0")]);
    h.files.put("tasks/a.json", "a"); // remote deleted a
    h.remote.put("tasks/b.json", "b"); // local deleted b
    const res = await h.sync();
    expect(res).toMatchObject({ deletedLocal: 1, deletedRemote: 1 });
    expect(h.files.data.size).toBe(0);
    expect(h.remote.files.size).toBe(0);
    expect(h.state().files).toEqual({});
  });

  it("resolves a conflict: copy to .atlas/conflicts remotely, remote wins locally", async () => {
    const h = harness([B("tasks/a.json", "base", "r0")]);
    h.files.put("tasks/a.json", "mine");
    h.remote.put("tasks/a.json", "theirs");
    const res = await h.sync();
    expect(res.conflicts).toBe(1);
    expect(h.remote.files.get(".atlas/conflicts/tasks/a.mac-20261003T090807Z.json")?.text).toBe("mine");
    expect(h.files.text("tasks/a.json")).toBe("theirs");
    expect(h.remote.log).toContain("upload .atlas/conflicts/tasks/a.mac-20261003T090807Z.json overwrite");
  });

  it("holds mass deletes and keeps their base entries", async () => {
    const paths = Array.from({ length: 12 }, (_, i) => `tasks/${i}.json`);
    const h = harness(paths.map((p) => B(p, "h")));
    paths.forEach((p) => h.files.put(p, "h"));
    const res = await h.sync();
    expect(res).toMatchObject({ heldDeletes: 12, deletedLocal: 0 });
    expect(h.files.data.size).toBe(12);
    expect(Object.keys(h.state().files)).toHaveLength(12);
  });

  it("skips on a local CAS miss, leaving base alone", async () => {
    const h = harness([B("tasks/a.json", "old", "r0")]);
    h.files.put("tasks/a.json", "old");
    h.remote.put("tasks/a.json", "new");
    h.files.casMiss.add("tasks/a.json");
    const res = await h.sync();
    expect(res.downloaded).toBe(0);
    expect(h.state().files["tasks/a.json"]!.contentHash).toBe("old");
  });

  it("skips a RemoteConflictError without failing the run", async () => {
    const h = harness([B("tasks/a.json", "old", "r0")]);
    h.files.put("tasks/a.json", "new");
    h.remote.put("tasks/a.json", "old");
    h.remote.stale.add("tasks/a.json");
    h.files.put("tasks/ok.json", "x");
    const res = await h.sync();
    expect(res.uploaded).toBe(1);
    expect(h.state().files["tasks/a.json"]!.contentHash).toBe("old");
  });

  it("propagates other errors but still saves progress", async () => {
    const h = harness();
    h.files.put("tasks/a.json", "a");
    h.remote.upload = async () => { throw new TypeError("Failed to fetch"); };
    await expect(h.sync()).rejects.toBeInstanceOf(TypeError);
    expect(h.saved.length).toBe(1);
  });

  it("phone include filter: remote attachments/ and .atlas/ are ignored, never local deletes", async () => {
    const phone = (p: string) => /^(tasks|notes|goals|notebooks)\/[^/]+$/.test(p);
    const h = harness([B("attachments/x/p.png", "h")], phone);
    h.remote.put("attachments/x/p.png", "h");
    h.remote.put(".atlas/conflicts/tasks/a.json", "c");
    h.remote.put("tasks/a.json", "t");
    h.files.put("attachments/x/p.png", "h");
    const res = await h.sync();
    expect(res).toMatchObject({ downloaded: 1, deletedLocal: 0, deletedRemote: 0 });
    expect(h.files.data.has("attachments/x/p.png")).toBe(true);
    expect(h.files.data.has(".atlas/conflicts/tasks/a.json")).toBe(false);
  });

  it("reports progress", async () => {
    const h = harness();
    h.files.put("tasks/a.json", "a");
    h.files.put("tasks/b.json", "b");
    const seen: [number, number][] = [];
    await syncOnce({
      files: h.files, remote: h.remote, include: all, deviceName: "mac",
      state: { load: async () => ({ files: {} }), save: async () => {} },
      onProgress: (d, t) => seen.push([d, t]),
    });
    expect(seen).toEqual([[0, 2], [1, 2], [2, 2]]);
  });

  it("one failing file is reported and the rest still sync", async () => {
    const h = harness();
    for (const n of ["a", "b", "c", "d", "e"]) h.files.put(`tasks/${n}.json`, n);
    const upload = h.remote.upload.bind(h.remote);
    h.remote.upload = async (path, bytes, rev) => {
      if (path === "tasks/b.json") throw new Error("tasks/b.json is over 150 MB; upload sessions are not implemented");
      return upload(path, bytes, rev);
    };
    const res = await h.sync();
    expect(res.uploaded).toBe(4);
    expect(res.errors).toEqual(["tasks/b.json: tasks/b.json is over 150 MB; upload sessions are not implemented"]);
  });

  it("a fatal error stops every worker before the run rejects", async () => {
    const h = harness();
    for (let i = 0; i < 12; i++) h.files.put(`tasks/${i}.json`, `${i}`);
    const upload = h.remote.upload.bind(h.remote);
    let after = 0;
    let failed = false;
    h.remote.upload = async (path, bytes, rev) => {
      await new Promise((r) => setTimeout(r, 1));
      if (path === "tasks/1.json") {
        failed = true;
        throw new TypeError("Failed to fetch");
      }
      if (failed) after++;
      return upload(path, bytes, rev);
    };
    await expect(h.sync()).rejects.toThrow(TypeError);
    const saved = h.saved.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(h.saved.length).toBe(saved); // nothing still running to save later
    expect(after).toBeLessThanOrEqual(3); // only uploads already in flight finished
  });

  it("fetches a folder with many downloads as one zip, a small folder file by file", async () => {
    const h = harness();
    for (let i = 0; i < 25; i++) h.remote.put(`tasks/${i}.json`, `t${i}`);
    h.remote.put("notes/a.md", "na");
    h.remote.put("notes/b.md", "nb");
    expect(await h.sync()).toMatchObject({ downloaded: 27 });
    expect(h.remote.zips).toEqual(["tasks"]);
    expect(h.remote.downloads).toBe(2);
    expect(h.files.text("tasks/7.json")).toBe("t7");
    expect(h.state().files["tasks/7.json"]).toEqual({ path: "tasks/7.json", contentHash: "t7", rev: h.remote.files.get("tasks/7.json")!.rev });
    expect(await h.sync()).toMatchObject({ downloaded: 0 });
  });

  it("a file the zip can't vouch for comes down on its own; an unreadable zip falls back entirely", async () => {
    const h = harness();
    for (let i = 0; i < 25; i++) h.remote.put(`tasks/${i}.json`, `t${i}`);
    const zip = h.remote.downloadFolder.bind(h.remote);
    h.remote.downloadFolder = async (folder) => {
      const m = await zip(folder);
      m.set("tasks/3.json", { bytes: new TextEncoder().encode("older"), contentHash: "older" }); // changed since listing
      return m;
    };
    expect(await h.sync()).toMatchObject({ downloaded: 25 });
    expect(h.remote.downloads).toBe(1);
    expect(h.files.text("tasks/3.json")).toBe("t3");

    const g = harness();
    for (let i = 0; i < 25; i++) g.remote.put(`tasks/${i}.json`, `t${i}`);
    g.remote.downloadFolder = async () => { throw new Error("Zip directory is corrupt"); };
    expect(await g.sync()).toMatchObject({ downloaded: 25 });
    expect(g.remote.downloads).toBe(25);
  });
});
