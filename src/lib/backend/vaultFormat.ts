/**
 * Pure port of src-tauri/src/store_io.rs's file formats, so the phone writes
 * the exact files the Mac reads (and the reverse). Entities are pretty 2-space
 * JSON with keys in model.rs field order; notes are YAML frontmatter + body.
 * Parsing applies the same defaults as the Rust #[serde(default)] fields.
 */

import { Document, parse, visit, type ToStringOptions } from "yaml";
import type { Attachment, Context, Goal, GoalStatus, Note, Notebook, Subtask, Task, TaskStatus } from "@/types";

/* --------------------------------------------------------------- validation */

type Obj = Record<string, unknown>;

function asObj(value: unknown, what: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${what}: not an object`);
  return value as Obj;
}

function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new Error(`missing or invalid string field "${key}"`);
  return v;
}

/** Optional string-or-null field (Rust Option<String>, missing = None). */
function optStr(o: Obj, key: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new Error(`invalid field "${key}"`);
  return v;
}

function oneOf<T extends string>(o: Obj, key: string, allowed: readonly T[]): T {
  const v = str(o, key);
  if (!allowed.includes(v as T)) throw new Error(`invalid value for "${key}": ${v}`);
  return v as T;
}

const CONTEXTS = ["office", "personal"] as const satisfies readonly Context[];
const TASK_STATUSES = ["open", "done", "dropped"] as const satisfies readonly TaskStatus[];
const GOAL_STATUSES = ["active", "onhold", "done", "dropped"] as const satisfies readonly GoalStatus[];

function parseAttachments(o: Obj): Attachment[] {
  const v = o.attachments;
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error('invalid field "attachments"');
  return v.map((raw) => {
    const a = asObj(raw, "attachment");
    if (typeof a.size !== "number") throw new Error('invalid attachment "size"');
    return { path: str(a, "path"), name: str(a, "name"), size: a.size, added: str(a, "added") };
  });
}

function attachmentsOut(list: Attachment[]): Attachment[] {
  return list.map((a) => ({ path: a.path, name: a.name, size: a.size, added: a.added }));
}

/* ------------------------------------------------------------ JSON entities */

const json = (value: unknown): string => JSON.stringify(value, null, 2);

export function renderTask(t: Task): string {
  return json({
    id: t.id,
    title: t.title,
    context: t.context,
    status: t.status,
    created: t.created,
    due: t.due,
    snoozeUntil: t.snoozeUntil,
    completed: t.completed,
    goalId: t.goalId,
    subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, status: s.status })),
    details: t.details,
    priority: t.priority,
    attachments: attachmentsOut(t.attachments),
    committedOn: t.committedOn,
    carried: t.carried,
  });
}

export function parseTask(raw: string): Task {
  const o = asObj(JSON.parse(raw), "task");
  const subtasks = o.subtasks;
  if (!Array.isArray(subtasks)) throw new Error('missing field "subtasks"');
  return {
    id: str(o, "id"),
    title: str(o, "title"),
    context: oneOf(o, "context", CONTEXTS),
    status: oneOf(o, "status", TASK_STATUSES),
    created: str(o, "created"),
    due: optStr(o, "due"),
    snoozeUntil: optStr(o, "snoozeUntil"),
    completed: optStr(o, "completed"),
    goalId: optStr(o, "goalId"),
    subtasks: subtasks.map((raw): Subtask => {
      const s = asObj(raw, "subtask");
      return { id: str(s, "id"), title: str(s, "title"), status: oneOf(s, "status", ["open", "done"] as const) };
    }),
    details: o.details === undefined ? "" : str(o, "details"),
    priority: o.priority === undefined ? false : o.priority === true,
    attachments: parseAttachments(o),
    committedOn: optStr(o, "committedOn"),
    carried: typeof o.carried === "number" ? o.carried : 0,
  };
}

export function renderGoal(g: Goal): string {
  return json({
    id: g.id,
    title: g.title,
    description: g.description,
    context: g.context,
    status: g.status,
    target: g.target,
    created: g.created,
    updated: g.updated,
  });
}

export function parseGoal(raw: string): Goal {
  const o = asObj(JSON.parse(raw), "goal");
  return {
    id: str(o, "id"),
    title: str(o, "title"),
    description: str(o, "description"),
    context: oneOf(o, "context", CONTEXTS),
    status: oneOf(o, "status", GOAL_STATUSES),
    target: optStr(o, "target"),
    created: str(o, "created"),
    updated: str(o, "updated"),
  };
}

export function renderNotebook(n: Notebook): string {
  return json({ id: n.id, name: n.name, context: n.context, created: n.created, updated: n.updated });
}

export function parseNotebook(raw: string): Notebook {
  const o = asObj(JSON.parse(raw), "notebook");
  return {
    id: str(o, "id"),
    name: str(o, "name"),
    context: oneOf(o, "context", CONTEXTS),
    created: str(o, "created"),
    updated: str(o, "updated"),
  };
}

/* ------------------------------------------------------------------- notes */

// Block style, no line folding (Rust never folds), nothing fancy.
const YAML_OPTS: ToStringOptions = { lineWidth: 0 };
// YAML 1.1 words some readers still resolve to bool/null; quote them so every
// reader (any serde_yaml version included) sees a string.
const YAML11_WORD = /^(y|n|yes|no|on|off|true|false|null|~)$/i;

function frontmatterYaml(note: Note): string {
  const doc = new Document(
    {
      id: note.id,
      title: note.title,
      context: note.context,
      goalId: note.goalId ?? "",
      notebookId: note.notebookId ?? "",
      created: note.created,
      updated: note.updated,
      attachments: attachmentsOut(note.attachments),
    },
    { schema: "core" },
  );
  visit(doc, {
    Scalar(_key, node) {
      if (typeof node.value === "string" && YAML11_WORD.test(node.value)) node.type = "QUOTE_DOUBLE";
    },
  });
  return doc.toString(YAML_OPTS);
}

/** "---\n" + yaml + "---\n" + body, as store_io.rs render_note_file. */
export function renderNote(note: Note, body: string): string {
  return `---\n${frontmatterYaml(note)}---\n${body}`;
}

/** Port of split_frontmatter: [yaml, body]. The closing `---` must be alone on its line. */
function splitFrontmatter(raw: string): [string, string] {
  const rest = raw.startsWith("---\n") ? raw.slice(4) : raw.startsWith("---\r\n") ? raw.slice(5) : null;
  if (rest === null) throw new Error("missing opening frontmatter delimiter");
  let from = 0;
  for (;;) {
    const abs = rest.indexOf("---", from);
    if (abs === -1) throw new Error("missing closing frontmatter delimiter");
    const after = rest.slice(abs + 3);
    const atLineStart = abs === 0 || rest[abs - 1] === "\n";
    const lineOnly = after === "" || after.startsWith("\n") || after.startsWith("\r\n");
    if (atLineStart && lineOnly) {
      const body = after.startsWith("\n") ? after.slice(1) : after.startsWith("\r\n") ? after.slice(2) : after;
      return [rest.slice(0, abs), body];
    }
    from = abs + 3;
  }
}

/** Note metadata from a whole .md file; "" ids become null, missing notebookId/attachments default. */
export function parseNoteMeta(raw: string): Note {
  const [yaml] = splitFrontmatter(raw);
  const o = asObj(parse(yaml, { schema: "core" }), "note frontmatter");
  return {
    id: str(o, "id"),
    title: str(o, "title"),
    context: oneOf(o, "context", CONTEXTS),
    goalId: blankToNull(str(o, "goalId")),
    notebookId: o.notebookId === undefined ? null : blankToNull(str(o, "notebookId")),
    created: str(o, "created"),
    updated: str(o, "updated"),
    attachments: parseAttachments(o),
  };
}

/** The markdown body of a whole .md file. */
export function parseNoteBody(raw: string): string {
  return splitFrontmatter(raw)[1];
}

const blankToNull = (v: string): string | null => (v.trim() === "" ? null : v);
