import { describe, expect, it, vi } from "vitest";
import type { Note } from "@/types";

const ipc = vi.hoisted(() => ({ setNotePinned: vi.fn(), updateNote: vi.fn() }));
vi.mock("@/lib/ipc", () => ipc);

import { useStore } from "./store";

const note: Note = {
  id: "n1", title: "N", context: "office", goalId: null, notebookId: null,
  created: "2026-09-01T09:00:00Z", updated: "2026-09-01T09:00:00Z", attachments: [], pinned: false,
};

describe("setNotePinned", () => {
  it("persists via the metadata ipc and patches only `pinned` in the store", async () => {
    ipc.setNotePinned.mockResolvedValue({ ...note, pinned: true, updated: "disk-copy" });
    useStore.setState({ notes: [{ ...note, title: "edited in memory" }] });
    await useStore.getState().setNotePinned("n1", true);
    expect(ipc.setNotePinned).toHaveBeenCalledWith("n1", true);
    const n = useStore.getState().notes[0]!;
    expect(n.pinned).toBe(true);
    expect(n.title).toBe("edited in memory");
  });

  it("an editor save with a stale copy keeps the pin", async () => {
    ipc.updateNote.mockImplementation(async (n: Note) => n);
    useStore.setState({ notes: [{ ...note, pinned: true }], notebooks: [], goals: [] });
    await useStore.getState().saveNote({ ...note, pinned: false, title: "typed" }, "body");
    expect(ipc.updateNote.mock.calls[0]![0].pinned).toBe(true);
  });

  it("a pin issued during a pending save lands after it: both pin and body survive", async () => {
    let disk = { note: { ...note }, body: "old" };
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    ipc.setNotePinned.mockReset();
    ipc.updateNote.mockImplementation(async (n: Note, body: string) => {
      await gate;
      disk = { note: { ...n }, body };
      return disk.note;
    });
    ipc.setNotePinned.mockImplementation(async (_id: string, pinned: boolean) => {
      disk = { ...disk, note: { ...disk.note, pinned } };
      return disk.note;
    });
    useStore.setState({ notes: [{ ...note }], notebooks: [], goals: [] });
    const save = useStore.getState().saveNote({ ...note, title: "typed" }, "new body");
    const pin = useStore.getState().setNotePinned("n1", true);
    await Promise.resolve();
    expect(ipc.setNotePinned).not.toHaveBeenCalled();
    release();
    await Promise.all([save, pin]);
    expect(disk.body).toBe("new body");
    expect(disk.note.pinned).toBe(true);
    expect(useStore.getState().notes[0]!.pinned).toBe(true);
  });
});
