import { describe, expect, it } from "vitest";
import type { Note } from "@/types";
import { composeNoteSave, freshestNote, settlePatch } from "./noteSave";

const note = (over: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "Old",
  context: "office",
  goalId: null,
  notebookId: "nb-old",
  created: "2026-01-01T00:00:00Z",
  updated: "2026-01-01T00:00:00Z",
  attachments: [],
  pinned: false,
  ...over,
});
const working = { title: "Typed", context: "office" as const, attachments: [] };

describe("composeNoteSave", () => {
  it("a pending autosave composed after a filing patch keeps the new notebook", () => {
    // The autosave target was captured with the OLD notebook; the patch is newer.
    const saved = composeNoteSave(note(), { notebookId: "nb-new" }, working);
    expect(saved.notebookId).toBe("nb-new");
    expect(saved.title).toBe("Typed"); // pending title edit survives the filing write
  });

  it("successive patches accumulate", () => {
    const patch = { ...{ context: "personal" as const }, ...{ goalId: "g1" } };
    const saved = composeNoteSave(note(), patch, { ...working, context: "personal" });
    expect(saved).toMatchObject({ context: "personal", goalId: "g1" });
  });

  it("freshestNote prefers the live copy of the same note only", () => {
    const stale = note();
    const live = note({ notebookId: "nb-live" });
    expect(freshestNote(stale, live)).toBe(live);
    expect(freshestNote(stale, note({ id: "other" }))).toBe(stale);
    expect(freshestNote(stale, null)).toBe(stale);
  });
});

describe("settlePatch", () => {
  it("keeps a filing patch when an unrelated note update (a pin) arrives", () => {
    const patch = { notebookId: "nb-new" };
    expect(settlePatch(patch, note({ pinned: true }))).toEqual(patch);
  });
  it("drops only the keys the incoming note now matches", () => {
    const patch = { notebookId: "nb-new", goalId: "g1" };
    expect(settlePatch(patch, note({ notebookId: "nb-new" }))).toEqual({ goalId: "g1" });
  });
});
