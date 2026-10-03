import { describe, expect, it } from "vitest";
import { parseNoteBody, parseNoteMeta, parseTask, renderNote, renderTask } from "./vaultFormat";
import { noteMinimal, taskMinimal } from "./specEntities";

const TRICKY = [
  "yes", "No", "on", "123", "1.5", "null", "~", "true", "a: b", "- dash", "# hash", 'say "hi"', "it's",
  "ünïcödé ✓ 日本語", "  padded  ", "line1\nline2", "", "2026-06-07", "0x1F", "---", "a: b: c", "{x}", "[y]", "@at", "%pct",
];

describe("note frontmatter", () => {
  it.each(TRICKY)("round-trips title %j as a string", (title) => {
    const note = { ...noteMinimal, title };
    const raw = renderNote(note, "body\n");
    expect(parseNoteMeta(raw)).toEqual(note);
    expect(parseNoteBody(raw)).toBe("body\n");
  });

  it("quotes YAML 1.1 words so any reader sees a string", () => {
    expect(renderNote({ ...noteMinimal, title: "yes" }, "")).toContain('title: "yes"');
  });

  it("maps blank ids to null and defaults missing notebookId/attachments", () => {
    const raw = "---\nid: n\ntitle: T\ncontext: office\ngoalId: ''\ncreated: a\nupdated: b\n---\nhi";
    expect(parseNoteMeta(raw)).toEqual({
      id: "n", title: "T", context: "office", goalId: null, notebookId: null, created: "a", updated: "b", attachments: [],
    });
  });

  it("tolerates CRLF and requires the closing --- alone on its line", () => {
    const raw = "---\r\nid: n\r\ntitle: a --- b\r\ncontext: office\r\ngoalId: ''\r\ncreated: a\r\nupdated: b\r\n---\r\nbody --- x\r\n";
    expect(parseNoteMeta(raw).title).toBe("a --- b");
    expect(parseNoteBody(raw)).toBe("body --- x\r\n");
  });

  it("rejects a file without delimiters", () => {
    expect(() => parseNoteBody("no frontmatter")).toThrow(/opening/);
    expect(() => parseNoteBody("---\nid: x\n")).toThrow(/closing/);
  });
});

describe("task json", () => {
  it("applies serde defaults for fields older files lack", () => {
    const old = JSON.stringify({
      id: "t", title: "x", context: "office", status: "open", created: "c",
      due: null, snoozeUntil: null, completed: null, goalId: null, subtasks: [],
    });
    expect(parseTask(old)).toEqual({ ...taskMinimal, id: "t", title: "x", context: "office", created: "c" });
  });

  it("writes keys in model order, 2-space indent", () => {
    const out = renderTask(taskMinimal);
    expect(out.startsWith('{\n  "id"')).toBe(true);
    expect(Object.keys(JSON.parse(out))).toEqual([
      "id", "title", "context", "status", "created", "due", "snoozeUntil", "completed", "goalId",
      "subtasks", "details", "priority", "attachments", "committedOn", "carried",
    ]);
  });
});
