import { describe, expect, it, vi } from "vitest";
import { createMemoryFiles } from "./idbFiles";
import { createWebBackend, searchBodies, setWebAttachmentOpener, openAttachment } from "./web";
import { parseNoteBody } from "./vaultFormat";

const setup = () => {
  const files = createMemoryFiles();
  return { files, be: createWebBackend(files) };
};

describe("tasks", () => {
  it("create uses uuid + seconds-precision Z timestamps", async () => {
    const { be } = setup();
    const t = await be.createTask({ title: "x", context: "office" });
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.created).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(t).toMatchObject({ status: "open", due: null, goalId: null, carried: 0, subtasks: [] });
    expect((await be.loadAll()).tasks).toEqual([t]);
  });

  it("completed rule sets, preserves, clears", async () => {
    const { be } = setup();
    const t = await be.createTask({ title: "x", context: "office" });
    const done = await be.updateTask({ ...t, status: "done" });
    expect(done.completed).not.toBeNull();
    const kept = await be.updateTask({ ...done, completed: "2026-01-01T00:00:00Z" });
    expect(kept.completed).toBe("2026-01-01T00:00:00Z");
    expect((await be.updateTask({ ...kept, status: "open" })).completed).toBeNull();
    expect((await be.updateTask({ ...kept, status: "dropped" })).completed).toBeNull();
  });

  it("delete removes the file and errors when missing", async () => {
    const { be } = setup();
    const t = await be.createTask({ title: "x", context: "office" });
    await be.deleteTask(t.id);
    expect((await be.loadAll()).tasks).toEqual([]);
    await expect(be.deleteTask(t.id)).rejects.toThrow(/Not found/);
  });
});

describe("notes", () => {
  it("update bumps `updated`; move_note keeps the body", async () => {
    const { be, files } = setup();
    const nb = await be.createNotebook({ name: "N", context: "office" });
    const n = await be.createNote({ title: "T", context: "office", body: "# Body\n\nkeep me\n" });
    const moved = await be.moveNote(n.id, nb.id);
    expect(moved.notebookId).toBe(nb.id);
    expect(await be.loadNoteBody(n.id)).toBe("# Body\n\nkeep me\n");
    expect((await be.loadAll()).notes[0]?.notebookId).toBe(nb.id);
    const upd = await be.updateNote(moved, "new body");
    expect(parseNoteBody((await files.readText(`notes/${n.id}.md`))!)).toBe("new body");
    expect(upd.updated >= n.updated).toBe(true);
  });

  it("deleting a notebook unfiles its notes, keeping bodies", async () => {
    const { be } = setup();
    const nb = await be.createNotebook({ name: "N", context: "office" });
    const filed = await be.createNote({ title: "in", context: "office", notebookId: nb.id, body: "b1" });
    const other = await be.createNote({ title: "out", context: "office", body: "b2" });
    const res = await be.deleteNotebook(nb.id);
    expect(res.clearedNoteIds).toEqual([filed.id]);
    const snap = await be.loadAll();
    expect(snap.notebooks).toEqual([]);
    expect(snap.notes.find((x) => x.id === filed.id)?.notebookId).toBeNull();
    expect(await be.loadNoteBody(filed.id)).toBe("b1");
    expect(await be.loadNoteBody(other.id)).toBe("b2");
  });
});

describe("goals", () => {
  it("delete clears goalId on tasks and notes and returns the ids", async () => {
    const { be } = setup();
    const g = await be.createGoal({ title: "G", context: "office" });
    const t = await be.createTask({ title: "t", context: "office", goalId: g.id });
    const n = await be.createNote({ title: "n", context: "office", goalId: g.id, body: "keep" });
    const free = await be.createTask({ title: "free", context: "office" });
    const res = await be.deleteGoal(g.id);
    expect(res).toEqual({ clearedTaskIds: [t.id], clearedNoteIds: [n.id] });
    const snap = await be.loadAll();
    expect(snap.goals).toEqual([]);
    expect(snap.tasks.find((x) => x.id === t.id)?.goalId).toBeNull();
    expect(snap.tasks.find((x) => x.id === free.id)).toBeDefined();
    expect(snap.notes[0]?.goalId).toBeNull();
    expect(await be.loadNoteBody(n.id)).toBe("keep");
  });
});

describe("load_all", () => {
  it("skips bad files with a warning", async () => {
    const { be, files } = setup();
    await be.createTask({ title: "ok", context: "office" });
    await files.writeText("tasks/bad.json", "{ nope");
    await files.writeText("notes/bad.md", "no frontmatter");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const snap = await be.loadAll();
    expect(snap.tasks).toHaveLength(1);
    expect(snap.notes).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe("search_note_bodies", () => {
  it("matches body case-insensitively with a one-line excerpt, ignoring frontmatter", async () => {
    const { be } = setup();
    const hit = await be.createNote({ title: "Import Business", context: "office", body: "Quarterly plan for the Import Business,\nshipping in March.\n" });
    await be.createNote({ title: "miss", context: "office", body: "Unrelated prose.\n" });
    const hits = await be.searchNoteBodies("import business");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe(hit.id);
    expect(hits[0]?.snippet).toContain("Import Business,");
    expect(hits[0]?.snippet).not.toContain("\n");
    expect(await be.searchNoteBodies("   ")).toEqual([]);
    expect(await be.searchNoteBodies("office")).toEqual([]); // frontmatter only
  });

  it("honors the limit and ellipsizes cut ends", () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, body: "x".repeat(100) + "needle" + "y".repeat(100) }));
    const hits = searchBodies(notes, "NEEDLE");
    expect(hits).toHaveLength(20);
    expect(hits[0]?.snippet).toBe("…" + "x".repeat(32) + "needle" + "y".repeat(72) + "…");
  });
});

describe("phone limits", () => {
  it("rejects vault and attachment writes, opens attachments via the registered opener", async () => {
    const { be } = setup();
    await expect(be.chooseVault()).rejects.toThrow("Not available in the phone app");
    await expect(be.relocateVault("x")).rejects.toThrow("Not available in the phone app");
    await expect(be.attachFiles("id", [])).rejects.toThrow("isn't available in the phone app yet");
    expect(await be.getConfiguredVaultPath()).toBeNull();
    expect(await be.getVaultPath()).toBeNull(); // no localStorage under node
    expect(await be.checkForUpdate()).toBeNull();
    await expect(openAttachment("attachments/a/b.pdf")).rejects.toThrow();
    const opener = vi.fn(async () => {});
    setWebAttachmentOpener(opener);
    await openAttachment("attachments/a/b.pdf");
    expect(opener).toHaveBeenCalledWith("attachments/a/b.pdf");
  });
});
