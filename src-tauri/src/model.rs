//! Serde structs mirroring `src/types.ts` exactly.
//!
//! Every field is serialized in `camelCase` to match the on-disk JSON / YAML
//! encoding and the IPC payloads the frontend expects. Enums serialize in
//! `lowercase` (e.g. `"office"`, `"done"`). See docs/adr/0004 and 0006 for the
//! date and ownership rules these types encode.

use serde::{Deserialize, Serialize};

/// Office vs personal — the single classifying dimension (see CONTEXT.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Context {
    Office,
    Personal,
}

/// A task is in exactly one status. "Snoozed" is not a status (ADR/CONTEXT).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Open,
    Done,
    Dropped,
}

/// A subtask only has open/done (no `dropped`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubtaskStatus {
    Open,
    Done,
}

/// A goal's label — independent of its computed progress (ADR-0002).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GoalStatus {
    Active,
    Onhold,
    Done,
    Dropped,
}

/// Single-level checklist item under a Task (ADR-0001 — no nesting).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subtask {
    pub id: String,
    pub title: String,
    pub status: SubtaskStatus,
}

/// A file copied into the vault and linked to a task or a note. Stored under
/// `attachments/<entityId>/<filename>` (vault-relative, POSIX separators) —
/// see docs/agents' attachments contract and ADR-0006.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    /// Vault-relative POSIX path, e.g. "attachments/<entityId>/report.pdf".
    pub path: String,
    /// Display filename.
    pub name: String,
    /// Size in bytes at attach time.
    pub size: u64,
    /// UTC `Z`.
    pub added: String,
}

/// A single thing the user intends to do — the source of truth for what's
/// outstanding. Stored as `tasks/<id>.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub context: Context,
    pub status: TaskStatus,
    /// Auto, immutable. UTC RFC3339 with trailing `Z`.
    pub created: String,
    /// Bare `YYYY-MM-DD` or null.
    pub due: Option<String>,
    /// Bare `YYYY-MM-DD` or null.
    pub snooze_until: Option<String>,
    /// Auto: set when status → done, cleared when reopened. UTC `Z` or null.
    pub completed: Option<String>,
    /// A task links to at most one goal.
    pub goal_id: Option<String>,
    pub subtasks: Vec<Subtask>,
    /// Free-form notes/details for the task. Defaults to empty so task files
    /// written before this field existed still load (ADR-0006 resilience).
    #[serde(default)]
    pub details: String,
    /// User-flagged priority. Defaults to false for files written before it existed.
    #[serde(default)]
    pub priority: bool,
    /// Files copied into the vault and linked to this task. Defaults to empty
    /// so task files written before this field existed still load (ADR-0006
    /// resilience).
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    /// Bare `YYYY-MM-DD` local day this task is committed to (Today's slate),
    /// or `None`. Defaults to `None` so task files written before this field
    /// existed still load (ADR-0006 resilience).
    #[serde(default)]
    pub committed_on: Option<String>,
    /// How many times this task was re-committed after failing to finish.
    /// Defaults to 0 for files written before this field existed.
    #[serde(default)]
    pub carried: u32,
}

/// A note whose markdown *body* matched a search query, with a short excerpt
/// around the first match. Bodies are never held in the frontend store
/// (ADR-0006), so body search runs over the files here and returns only this.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteBodyHit {
    pub id: String,
    /// One line of surrounding body text, whitespace-collapsed and elided.
    pub snippet: String,
}

/// Note metadata — the markdown body lives in the `.md` file and is loaded
/// lazily via `load_note_body`, never carried in this record. Stored as
/// `notes/<id>.md` with YAML frontmatter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub context: Context,
    pub goal_id: Option<String>,
    /// The notebook this note is filed in, or `None` when Unfiled. Virtual —
    /// the `.md` file stays flat in `notes/` (ADR-0008). Defaults to `None` so
    /// notes written before this field existed still load (ADR-0006).
    #[serde(default)]
    pub notebook_id: Option<String>,
    /// UTC `Z`.
    pub created: String,
    /// UTC `Z`.
    pub updated: String,
    /// Files copied into the vault and linked to this note, carried in the
    /// `.md` file's YAML frontmatter (not the body — inline markdown links are
    /// a separate, older mechanism this field doesn't replace). Defaults to
    /// empty so notes written before this field existed still load (ADR-0006
    /// resilience).
    #[serde(default)]
    pub attachments: Vec<Attachment>,
}

/// A context-scoped, single-level container that groups Notes (CONTEXT.md,
/// ADR-0008). Its note list is computed live by matching `notebookId`; it is
/// never stored. Context is fixed at creation. Stored as `notebooks/<id>.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notebook {
    pub id: String,
    pub name: String,
    pub context: Context,
    /// UTC `Z`.
    pub created: String,
    /// UTC `Z`.
    pub updated: String,
}

/// A longer-term aspiration promoted to a first-class object. Its task/note
/// lists are never stored — they're computed live by matching `goalId`. Stored
/// as `goals/<id>.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub title: String,
    /// Markdown.
    pub description: String,
    pub context: Context,
    pub status: GoalStatus,
    /// Bare `YYYY-MM-DD` or null.
    pub target: Option<String>,
    /// UTC `Z`.
    pub created: String,
    /// UTC `Z`.
    pub updated: String,
}

/* ----------------------------------------------------------- Create inputs.
   id / created / completed are Rust-authoritative and never sent from the UI. */

/// Payload for `create_task`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub title: String,
    pub context: Context,
    #[serde(default)]
    pub due: Option<String>,
    #[serde(default)]
    pub goal_id: Option<String>,
}

/// Payload for `create_note`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    pub title: String,
    pub context: Context,
    #[serde(default)]
    pub goal_id: Option<String>,
    /// The notebook to file the new note in (defaults to Unfiled).
    #[serde(default)]
    pub notebook_id: Option<String>,
    /// Initial markdown body (defaults to empty).
    #[serde(default)]
    pub body: Option<String>,
}

/// Payload for `create_notebook`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNotebookInput {
    pub name: String,
    pub context: Context,
}

/// Payload for `create_goal`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGoalInput {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub context: Context,
    #[serde(default)]
    pub target: Option<String>,
}

/* --------------------------------------------------------------- IPC shapes */

/// Payload returned by `load_all`. Notes carry metadata only (bodies are lazy).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreSnapshot {
    pub tasks: Vec<Task>,
    pub notes: Vec<Note>,
    pub goals: Vec<Goal>,
    pub notebooks: Vec<Notebook>,
}

/// Result of deleting a goal: which linked entities had `goalId` cleared
/// (ADR-0003).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalDeletionResult {
    pub cleared_task_ids: Vec<String>,
    pub cleared_note_ids: Vec<String>,
}

/// Result of deleting a notebook: which notes had `notebookId` cleared so they
/// fell back to Unfiled (ADR-0008, ADR-0003 cleanup — not a cascade delete).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookDeletionResult {
    pub cleared_note_ids: Vec<String>,
}
