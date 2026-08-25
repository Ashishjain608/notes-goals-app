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

/** A file copied into the vault and linked to a task or a note. */
export interface Attachment {
  /** Vault-relative POSIX path, e.g. "attachments/<entityId>/report.pdf". */
  path: string;
  /** Display filename. */
  name: string;
  /** Size in bytes at attach time. */
  size: number;
  added: IsoDateTime;
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
  /** Files copied into the vault and linked to this task. */
  attachments: Attachment[];
  /**
   * The local day this task was committed to (Today's slate), or null when it
   * sits in the pool. A date earlier than today means it was committed and not
   * finished: it drops back into the pool rather than lingering on the slate.
   */
  committedOn: IsoDate | null;
  /** How many times this task was re-committed after failing to finish. */
  carried: number;
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
  /**
   * The Notebook this note is filed in, or null when Unfiled. Virtual — the
   * .md file stays flat in notes/ (docs/adr/0008). A notebookId that resolves
   * to no notebook, or to a notebook of a different context, renders as Unfiled.
   */
  notebookId: string | null;
  created: IsoDateTime;
  updated: IsoDateTime;
  /**
   * Files copied into the vault and linked to this note, carried in the
   * note's YAML frontmatter (not the body — inline markdown links are a
   * separate, older mechanism this field doesn't replace).
   */
  attachments: Attachment[];
}

/**
 * A Notebook: a context-scoped, single-level container that groups Notes
 * (CONTEXT.md, docs/adr/0008). Its note list is never stored — it is computed
 * live by matching notebookId. Context is fixed at creation (rename only).
 */
export interface Notebook {
  id: string;
  name: string;
  context: Context;
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
  /** The notebook to file the new note in (defaults to Unfiled). */
  notebookId?: string | null;
  /** Initial markdown body (defaults to empty). */
  body?: string;
}

export interface CreateNotebookInput {
  name: string;
  context: Context;
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
  notebooks: Notebook[];
}

/** Result of deleting a goal: which linked entities had goalId cleared (docs/adr/0003). */
export interface GoalDeletionResult {
  clearedTaskIds: string[];
  clearedNoteIds: string[];
}

/** Result of deleting a notebook: which notes had notebookId cleared (→ Unfiled). */
export interface NotebookDeletionResult {
  clearedNoteIds: string[];
}
