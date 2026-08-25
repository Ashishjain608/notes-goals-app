/**
 * Unit tests for global search. `searchAll` is pure — the note-body half is
 * passed in as data (Rust reads it off disk), so nothing here needs a mock.
 */

import { describe, expect, it } from "vitest";
import type { Goal, Note, Notebook, Task } from "@/types";
import { searchAll, MIN_QUERY, type SearchCorpus } from "./search";

let seq = 0;

function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    context: "office",
    status: "open",
    created: "2026-06-01T09:00:00Z",
    due: null,
    snoozeUntil: null,
    completed: null,
    goalId: null,
    subtasks: [],
    details: "",
    priority: false,
    attachments: [],
    committedOn: null,
    carried: 0,
    ...overrides,
  };
}

function makeNote(overrides: Partial<Note> = {}): Note {
  seq += 1;
  return {
    id: `n${seq}`,
    title: `Note ${seq}`,
    context: "office",
    goalId: null,
    notebookId: null,
    created: "2026-06-01T09:00:00Z",
    updated: "2026-06-01T09:00:00Z",
    attachments: [],
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  seq += 1;
  return {
    id: `g${seq}`,
    title: `Goal ${seq}`,
    description: "",
    context: "office",
    status: "active",
    target: null,
    created: "2026-06-01T09:00:00Z",
    updated: "2026-06-01T09:00:00Z",
    ...overrides,
  };
}

function makeNotebook(overrides: Partial<Notebook> = {}): Notebook {
  seq += 1;
  return {
    id: `nb${seq}`,
    name: `Notebook ${seq}`,
    context: "office",
    created: "2026-06-01T09:00:00Z",
    updated: "2026-06-01T09:00:00Z",
    ...overrides,
  };
}

const EMPTY: SearchCorpus = { tasks: [], notes: [], goals: [], notebooks: [] };

describe("searchAll", () => {
  it("returns nothing below the minimum query length", () => {
    const corpus = { ...EMPTY, tasks: [makeTask({ title: "import containers" })] };
    expect(searchAll("i", corpus)).toEqual([]);
    expect(MIN_QUERY).toBe(2);
  });

  it("matches titles across every entity type, case-insensitively", () => {
    const corpus: SearchCorpus = {
      tasks: [makeTask({ id: "t", title: "Call the IMPORT broker" })],
      notes: [makeNote({ id: "n", title: "Import notes" })],
      goals: [makeGoal({ id: "g", title: "Import business" })],
      notebooks: [makeNotebook({ id: "nb", name: "Imports" })],
    };

    const kinds = searchAll("import", corpus).map((h) => h.kind);

    expect(kinds).toContain("task");
    expect(kinds).toContain("note");
    expect(kinds).toContain("goal");
    expect(kinds).toContain("notebook");
  });

  it("ranks a title prefix above a mid-title match, and both above a body match", () => {
    const corpus: SearchCorpus = {
      ...EMPTY,
      notes: [
        makeNote({ id: "mid", title: "The import plan" }),
        makeNote({ id: "pre", title: "Import plan" }),
        makeNote({ id: "body", title: "Unrelated" }),
      ],
    };

    const ids = searchAll("import", corpus, [{ id: "body", snippet: "…import…" }]).map((h) => h.id);

    expect(ids).toEqual(["pre", "mid", "body"]);
  });

  it("never lists one note twice when its title AND body match", () => {
    const note = makeNote({ id: "dup", title: "Import plan" });
    const corpus = { ...EMPTY, notes: [note] };

    const hits = searchAll("import", corpus, [{ id: "dup", snippet: "…import…" }]);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.sub).toBeUndefined(); // the title match wins, not the excerpt
  });

  it("carries the body excerpt as the hit's sub-line", () => {
    const corpus = { ...EMPTY, notes: [makeNote({ id: "b", title: "Unrelated" })] };

    const hits = searchAll("import", corpus, [{ id: "b", snippet: "…the import duty…" }]);

    expect(hits[0]?.sub).toBe("…the import duty…");
  });

  it("ignores a body hit for a note the store doesn't have", () => {
    const hits = searchAll("import", EMPTY, [{ id: "ghost", snippet: "…import…" }]);
    expect(hits).toEqual([]);
  });

  it("labels a task's status but leaves an open task's sub-line empty", () => {
    const corpus: SearchCorpus = {
      ...EMPTY,
      tasks: [
        makeTask({ id: "open", title: "Import A" }),
        makeTask({ id: "done", title: "Import B", status: "done" }),
      ],
    };

    const byId = new Map(searchAll("import", corpus).map((h) => [h.id, h] as const));

    expect(byId.get("open")?.sub).toBeUndefined();
    expect(byId.get("done")?.sub).toBe("done");
  });

  it("caps the result list", () => {
    const tasks = Array.from({ length: 30 }, (_, i) => makeTask({ title: `import ${i}` }));

    expect(searchAll("import", { ...EMPTY, tasks })).toHaveLength(12);
    expect(searchAll("import", { ...EMPTY, tasks }, [], 3)).toHaveLength(3);
  });
});
