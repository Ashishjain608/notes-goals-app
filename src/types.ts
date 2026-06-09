/**
 * Shared domain types — the single contract every module codes against.
 *
 * On-disk encoding (see docs/adr/0004 and docs/adr/0006):
 *   - IsoDateTime: UTC ISO-8601 with 'Z', e.g. "2026-06-07T06:30:00Z"
 *   - IsoDate:     bare calendar date "YYYY-MM-DD" (no time, no zone)
 *   - JSON files store these field names verbatim (camelCase); the Rust serde
 *     structs use #[serde(rename_all = "camelCase")] to match.
 */

export type Context = "office" | "personal";
/** The global filter applied across every view. */
export type ContextFilter = Context | "all";

export type TaskStatus = "open" | "done" | "dropped";
export type SubtaskStatus = "open" | "done";
export type GoalStatus = "active" | "onhold" | "done" | "dropped";

/** UTC datetime, ISO-8601 with trailing 'Z'. */
export type IsoDateTime = string;
/** Calendar date, "YYYY-MM-DD". */
export type IsoDate = string;

/** Single-level checklist item under a Task (docs/adr/0001 — no nesting). */
export interface Subtask {
  id: string;
  title: string;
  status: SubtaskStatus;
}

export interface Task {
  id: string;
  title: string;
  context: Context;
  status: TaskStatus;
  /** Auto, immutable. */
  created: IsoDateTime;
  due: IsoDate | null;
  snoozeUntil: IsoDate | null;
  /** Auto: set when status → done, cleared when reopened. */
  completed: IsoDateTime | null;
  /** A task links to at most one goal. */
  goalId: string | null;
  subtasks: Subtask[];
  /** Free-form notes/details for the task (markdown-ish plain text; "" when empty). */
  details: string;
  /** User-flagged "do this now" priority — floats to the top and is highlighted. */
  priority: boolean;
}

/**
 * Note metadata. The markdown body lives in the .md file and is loaded lazily
 * via loadNoteBody(id) — it is NOT part of this in-memory record.
 */
export interface Note {
  id: string;
  title: string;
  context: Context;
  goalId: string | null;
  created: IsoDateTime;
  updated: IsoDateTime;
}

export interface Goal {
  id: string;
  title: string;
  /** Markdown. */
  description: string;
  context: Context;
  status: GoalStatus;
  target: IsoDate | null;
  created: IsoDateTime;
  updated: IsoDateTime;
}

/* ----------------------------------------------------------- Create inputs
   id / created / completed are Rust-authoritative and never sent from the UI. */

export interface CreateTaskInput {
  title: string;
  context: Context;
  due?: IsoDate | null;
  goalId?: string | null;
}

export interface CreateNoteInput {
  title: string;
  context: Context;
  goalId?: string | null;
  /** Initial markdown body (defaults to empty). */
  body?: string;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  context: Context;
  target?: IsoDate | null;
}

/* --------------------------------------------------------------- IPC shapes */

/** Payload returned by load_all(). Notes carry metadata only (bodies are lazy). */
export interface StoreSnapshot {
  tasks: Task[];
  notes: Note[];
  goals: Goal[];
}

/** Result of deleting a goal: which linked entities had goalId cleared (docs/adr/0003). */
export interface GoalDeletionResult {
  clearedTaskIds: string[];
  clearedNoteIds: string[];
}
