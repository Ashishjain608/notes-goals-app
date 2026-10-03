/**
 * Cross-format fixtures (fixtures/SPEC.md). With UPDATE_FIXTURES=1 this writes
 * fixtures/ts/ from our serializers; otherwise it checks the checked-in files
 * still match them, and that Rust's files in fixtures/rust/ parse to the same values.
 */
import { describe, expect, it } from "vitest";
// @ts-ignore -- no @types/node in this repo; vitest runs in node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  parseGoal,
  parseNotebook,
  parseNoteBody,
  parseNoteMeta,
  parseTask,
  renderGoal,
  renderNote,
  renderNotebook,
  renderTask,
} from "./vaultFormat";
import * as spec from "./specEntities";

const dir = (sub: string) => new URL(`./fixtures/${sub}/`, import.meta.url);
const files: Record<string, string> = {
  "task-full.json": renderTask(spec.taskFull),
  "task-minimal.json": renderTask(spec.taskMinimal),
  "goal.json": renderGoal(spec.goal),
  "notebook.json": renderNotebook(spec.notebook),
  "note-full.md": renderNote(spec.noteFull, spec.noteFullBody),
  "note-minimal.md": renderNote(spec.noteMinimal, spec.noteMinimalBody),
};

// @ts-ignore -- no @types/node
if (process.env.UPDATE_FIXTURES === "1") {
  it("writes fixtures/ts", () => {
    mkdirSync(dir("ts"), { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(new URL(name, dir("ts")), text);
  });
} else {
  it.each(Object.keys(files))("fixtures/ts/%s matches the serializer", (name) => {
    expect(readFileSync(new URL(name, dir("ts")), "utf8")).toBe(files[name]);
  });
}

/** Parse each file under `sub` and compare with the spec entities. */
describe.each(["ts", "rust"])("fixtures/%s parse to the spec entities", (sub) => {
  const read = (name: string) => {
    const url = new URL(name, dir(sub));
    return existsSync(url) ? (readFileSync(url, "utf8") as string) : null;
  };
  const check = (name: string, run: (raw: string) => void) =>
    it(name, (ctx) => {
      const raw = read(name);
      if (raw === null) return ctx.skip();
      run(raw);
    });

  check("task-full.json", (raw) => expect(parseTask(raw)).toEqual(spec.taskFull));
  check("task-minimal.json", (raw) => expect(parseTask(raw)).toEqual(spec.taskMinimal));
  check("goal.json", (raw) => expect(parseGoal(raw)).toEqual(spec.goal));
  check("notebook.json", (raw) => expect(parseNotebook(raw)).toEqual(spec.notebook));
  check("note-full.md", (raw) => {
    expect(parseNoteMeta(raw)).toEqual(spec.noteFull);
    expect(parseNoteBody(raw)).toBe(spec.noteFullBody);
  });
  check("note-minimal.md", (raw) => {
    expect(parseNoteMeta(raw)).toEqual(spec.noteMinimal);
    expect(parseNoteBody(raw)).toBe(spec.noteMinimalBody);
  });
});
