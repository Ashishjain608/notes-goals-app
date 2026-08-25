//! The `#[tauri::command]` surface. Names and argument keys mirror
//! `src/lib/ipc.ts` exactly; Tauri maps camelCase JS keys to snake_case Rust
//! params. Every command resolves the vault from `config.json` on each call
//! (stateless — ADR-0006) and returns `Result<T, AppError>`.

use std::path::Path;

use chrono::{SecondsFormat, Utc};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::model::{
    Attachment, CreateGoalInput, CreateNoteInput, CreateNotebookInput, CreateTaskInput, Goal,
    GoalDeletionResult, GoalStatus, Note, Notebook, NotebookDeletionResult, StoreSnapshot, Task,
    TaskStatus,
};
use crate::store_io::{self, EntityKind};
use crate::vault;

/// Current instant as UTC RFC3339 with a trailing `Z` (ADR-0004).
fn now_utc() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

/// A fresh UUID v4 string used as an entity id / filename (ADR-0006).
fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/* -------------------------------------------------------------------- Vault */

/// The persisted vault path, but only if the folder exists and is readable.
#[tauri::command]
pub fn get_vault_path(app: AppHandle) -> AppResult<Option<String>> {
    Ok(vault::resolve_existing_vault(&app))
}

/// Open a native folder picker; on pick, initialize + persist the vault and
/// return its path. On cancel, return `None`. Async so the blocking dialog runs
/// off the main thread.
#[tauri::command]
pub async fn choose_vault(app: AppHandle) -> AppResult<Option<String>> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
    let resolved = vault::initialize_vault(&app, &path)?;
    Ok(Some(resolved))
}

/// Switch to a different existing vault folder: validate, create missing
/// subfolders, persist config.
#[tauri::command]
pub fn relocate_vault(app: AppHandle, path: String) -> AppResult<()> {
    vault::initialize_vault(&app, Path::new(&path))?;
    Ok(())
}

/* --------------------------------------------------------------------- Load */

/// Read the whole vault into one typed graph. Notes carry metadata only (bodies
/// are lazy). Resilient: malformed individual files are skipped (logged), and
/// dangling `goalId`s are returned verbatim for the frontend to tolerate.
#[tauri::command]
pub fn load_all(app: AppHandle) -> AppResult<StoreSnapshot> {
    let vault = vault::require_vault(&app)?;
    Ok(StoreSnapshot {
        tasks: store_io::load_tasks(&vault),
        notes: store_io::load_notes(&vault),
        goals: store_io::load_goals(&vault),
        notebooks: store_io::load_notebooks(&vault),
    })
}

/// Lazily read a single note's markdown body (frontmatter stripped).
#[tauri::command]
pub fn load_note_body(app: AppHandle, id: String) -> AppResult<String> {
    let vault = vault::require_vault(&app)?;
    store_io::read_note_body(&vault, &id)
}

/* -------------------------------------------------------------------- Tasks */

/// Create a task: Rust owns id + `created`; status `open`, no completed, empty
/// subtasks; due/goalId pass through from input.
#[tauri::command]
pub fn create_task(app: AppHandle, input: CreateTaskInput) -> AppResult<Task> {
    let vault = vault::require_vault(&app)?;
    let task = Task {
        id: new_id(),
        title: input.title,
        context: input.context,
        status: TaskStatus::Open,
        created: now_utc(),
        due: input.due,
        snooze_until: None,
        completed: None,
        goal_id: input.goal_id,
        subtasks: Vec::new(),
        details: String::new(),
        priority: false,
        attachments: Vec::new(),
        committed_on: None,
        carried: 0,
    };
    store_io::write_task(&vault, &task)?;
    Ok(task)
}

/// Persist an edited task, enforcing the `completed` rule idempotently from the
/// incoming status (Rust is authoritative for clock values):
/// - status == done && completed is null → set `completed` = now
/// - status != done                      → clear `completed`
/// - status == done && completed set     → keep it
#[tauri::command]
pub fn update_task(app: AppHandle, mut task: Task) -> AppResult<Task> {
    let vault = vault::require_vault(&app)?;
    apply_completed_rule(&mut task);
    store_io::write_task(&vault, &task)?;
    Ok(task)
}

/// Enforce the completed-timestamp invariant on a task in place.
fn apply_completed_rule(task: &mut Task) {
    match task.status {
        TaskStatus::Done => {
            if task.completed.is_none() {
                task.completed = Some(now_utc());
            }
        }
        TaskStatus::Open | TaskStatus::Dropped => {
            task.completed = None;
        }
    }
}

/// Hard-delete a task by moving its file to trash (ADR-0003), taking its
/// `attachments/<id>/` folder with it if one exists.
#[tauri::command]
pub fn delete_task(app: AppHandle, id: String) -> AppResult<()> {
    let vault = vault::require_vault(&app)?;
    store_io::move_to_trash(&vault, EntityKind::Task, &id)?;
    store_io::move_attachment_path_to_trash(&vault, &Path::new("attachments").join(&id))
}

/* -------------------------------------------------------------------- Notes */

/// Create a note: Rust owns id and `created == updated == now`. Writes the `.md`
/// file with the initial body (or empty) and returns the metadata.
#[tauri::command]
pub fn create_note(app: AppHandle, input: CreateNoteInput) -> AppResult<Note> {
    let vault = vault::require_vault(&app)?;
    let now = now_utc();
    let note = Note {
        id: new_id(),
        title: input.title,
        context: input.context,
        goal_id: input.goal_id,
        notebook_id: input.notebook_id,
        created: now.clone(),
        updated: now,
        attachments: Vec::new(),
    };
    let body = input.body.unwrap_or_default();
    store_io::write_note(&vault, &note, &body)?;
    Ok(note)
}

/// Persist an edited note + body: bump `updated`, preserve `created`, rewrite
/// the `.md`, and return the updated metadata.
#[tauri::command]
pub fn update_note(app: AppHandle, mut note: Note, body: String) -> AppResult<Note> {
    let vault = vault::require_vault(&app)?;
    note.updated = now_utc();
    store_io::write_note(&vault, &note, &body)?;
    Ok(note)
}

/// Hard-delete a note by moving its file to trash — the only removal path for
/// notes (ADR-0003) — taking its `attachments/<id>/` folder with it if one
/// exists. This is unconditional cleanup of the on-disk files under that
/// folder; it doesn't consult the note's `attachments` list (nor does it need
/// to — the note file itself, list included, is trashed in the same call).
#[tauri::command]
pub fn delete_note(app: AppHandle, id: String) -> AppResult<()> {
    let vault = vault::require_vault(&app)?;
    store_io::move_to_trash(&vault, EntityKind::Note, &id)?;
    store_io::move_attachment_path_to_trash(&vault, &Path::new("attachments").join(&id))
}

/// File a note into a notebook (or `None` to unfile). Metadata-only: reloads
/// the note's current body, rewrites the `.md` with the new `notebookId`, bumps
/// `updated`, and returns the updated metadata (ADR-0008). Validating that the
/// notebook's context matches is the frontend's job; the read side already
/// treats a context-mismatched pointer as Unfiled.
#[tauri::command]
pub fn move_note(app: AppHandle, id: String, notebook_id: Option<String>) -> AppResult<Note> {
    let vault = vault::require_vault(&app)?;
    let mut note = store_io::read_note_meta(&vault, &id)?;
    let body = store_io::read_note_body(&vault, &id)?;
    note.notebook_id = notebook_id;
    note.updated = now_utc();
    store_io::write_note(&vault, &note, &body)?;
    Ok(note)
}

/* ---------------------------------------------------------------- Notebooks */

/// Create a notebook: Rust owns id and `created == updated == now`. Its context
/// is fixed here and never changes afterward (ADR-0008).
#[tauri::command]
pub fn create_notebook(app: AppHandle, input: CreateNotebookInput) -> AppResult<Notebook> {
    let vault = vault::require_vault(&app)?;
    let now = now_utc();
    let notebook = Notebook {
        id: new_id(),
        name: input.name,
        context: input.context,
        created: now.clone(),
        updated: now,
    };
    store_io::write_notebook(&vault, &notebook)?;
    Ok(notebook)
}

/// Persist an edited notebook (rename): bump `updated`, rewrite, return. Context
/// is immutable by convention (ADR-0008), so only the name is expected to change.
#[tauri::command]
pub fn update_notebook(app: AppHandle, mut notebook: Notebook) -> AppResult<Notebook> {
    let vault = vault::require_vault(&app)?;
    notebook.updated = now_utc();
    store_io::write_notebook(&vault, &notebook)?;
    Ok(notebook)
}

/// Delete a notebook: clear the `notebookId` pointer on every note filed in it
/// (preserving each body so the note survives as Unfiled), move the notebook
/// file to trash, and report which notes were unfiled. Notes are never deleted
/// with the notebook (ADR-0008 / ADR-0003 cleanup, not a cascade).
#[tauri::command]
pub fn delete_notebook(app: AppHandle, id: String) -> AppResult<NotebookDeletionResult> {
    let vault = vault::require_vault(&app)?;
    let cleared_note_ids = clear_notebook_notes(&vault, &id)?;
    store_io::move_to_trash(&vault, EntityKind::Notebook, &id)?;
    Ok(NotebookDeletionResult { cleared_note_ids })
}

/// Rewrite every note whose `notebookId == notebook_id` with no notebook,
/// preserving its body, returning the unfiled note ids.
fn clear_notebook_notes(vault: &Path, notebook_id: &str) -> AppResult<Vec<String>> {
    let mut cleared = Vec::new();
    for mut note in store_io::load_notes(vault) {
        if note.notebook_id.as_deref() == Some(notebook_id) {
            let body = store_io::read_note_body(vault, &note.id)?;
            note.notebook_id = None;
            store_io::write_note(vault, &note, &body)?;
            cleared.push(note.id);
        }
    }
    Ok(cleared)
}

/* -------------------------------------------------------------------- Goals */

/// Create a goal: Rust owns id and `created == updated == now`; status `active`;
/// description defaults to empty.
#[tauri::command]
pub fn create_goal(app: AppHandle, input: CreateGoalInput) -> AppResult<Goal> {
    let vault = vault::require_vault(&app)?;
    let now = now_utc();
    let goal = Goal {
        id: new_id(),
        title: input.title,
        description: input.description.unwrap_or_default(),
        context: input.context,
        status: GoalStatus::Active,
        target: input.target,
        created: now.clone(),
        updated: now,
    };
    store_io::write_goal(&vault, &goal)?;
    Ok(goal)
}

/// Persist an edited goal: bump `updated`, rewrite, return.
#[tauri::command]
pub fn update_goal(app: AppHandle, mut goal: Goal) -> AppResult<Goal> {
    let vault = vault::require_vault(&app)?;
    goal.updated = now_utc();
    store_io::write_goal(&vault, &goal)?;
    Ok(goal)
}

/// Delete a goal: clear the `goalId` pointer on every linked task and note
/// (atomic per-file rewrite), move the goal file to trash, and report which ids
/// were cleared (ADR-0003 referential-integrity cleanup, not a status cascade).
#[tauri::command]
pub fn delete_goal(app: AppHandle, id: String) -> AppResult<GoalDeletionResult> {
    let vault = vault::require_vault(&app)?;

    let cleared_task_ids = clear_linked_tasks(&vault, &id)?;
    let cleared_note_ids = clear_linked_notes(&vault, &id)?;
    store_io::move_to_trash(&vault, EntityKind::Goal, &id)?;

    Ok(GoalDeletionResult {
        cleared_task_ids,
        cleared_note_ids,
    })
}

/// Rewrite every task whose `goalId == goal_id` with `goalId: null`, returning
/// the cleared task ids.
fn clear_linked_tasks(vault: &Path, goal_id: &str) -> AppResult<Vec<String>> {
    let mut cleared = Vec::new();
    for mut task in store_io::load_tasks(vault) {
        if task.goal_id.as_deref() == Some(goal_id) {
            task.goal_id = None;
            store_io::write_task(vault, &task)?;
            cleared.push(task.id);
        }
    }
    Ok(cleared)
}

/// Rewrite every note whose `goalId == goal_id` with an empty `goalId`,
/// preserving its body, returning the cleared note ids.
fn clear_linked_notes(vault: &Path, goal_id: &str) -> AppResult<Vec<String>> {
    let mut cleared = Vec::new();
    for mut note in store_io::load_notes(vault) {
        if note.goal_id.as_deref() == Some(goal_id) {
            // Preserve the body when rewriting the metadata.
            let body = store_io::read_note_body(vault, &note.id)?;
            note.goal_id = None;
            store_io::write_note(vault, &note, &body)?;
            cleared.push(note.id);
        }
    }
    Ok(cleared)
}

/* -------------------------------------------------------------- Attachments */

/// Copy each file at `paths` (absolute host paths picked via the native
/// dialog) into `<vault>/attachments/<entity_id>/`, suffixing on filename
/// collision, and return the created records in the same order as `paths`.
#[tauri::command]
pub fn attach_files(
    app: AppHandle,
    entity_id: String,
    paths: Vec<String>,
) -> AppResult<Vec<Attachment>> {
    let vault = vault::require_vault(&app)?;
    let now = now_utc();
    paths
        .iter()
        .map(|p| store_io::copy_attachment(&vault, &entity_id, Path::new(p), &now))
        .collect()
}

/// Attach clipboard-pasted bytes (no source path on disk) as a new
/// attachment named `name`. `name` is untrusted and sanitized to a bare
/// filename.
#[tauri::command]
pub fn attach_bytes(
    app: AppHandle,
    entity_id: String,
    name: String,
    bytes: Vec<u8>,
) -> AppResult<Attachment> {
    let vault = vault::require_vault(&app)?;
    store_io::write_attachment(&vault, &entity_id, &name, &bytes, &now_utc())
}

/// Move an attachment file to trash — never unlinked (ADR-0003). `path` is
/// untrusted and validated hard against path traversal.
#[tauri::command]
pub fn remove_attachment(app: AppHandle, path: String) -> AppResult<()> {
    let vault = vault::require_vault(&app)?;
    let absolute = store_io::resolve_attachment_path(&vault, &path)?;
    let relative = absolute.strip_prefix(&vault).unwrap_or(&absolute);
    store_io::move_attachment_path_to_trash(&vault, relative)
}

/// Open an attachment in the OS default app. `path` is untrusted and
/// validated hard against path traversal.
#[tauri::command]
pub fn open_attachment(app: AppHandle, path: String) -> AppResult<()> {
    let vault = vault::require_vault(&app)?;
    let absolute = store_io::resolve_attachment_path(&vault, &path)?;
    app.opener()
        .open_path(absolute.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Context;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn temp_vault() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let pid = std::process::id();
        let dir = std::env::temp_dir().join(format!("notes-goals-cmd-test-{pid}-{n}"));
        vault::ensure_subfolders(&dir).unwrap();
        dir
    }

    #[test]
    fn completed_rule_sets_clears_and_preserves() {
        // done with no completed → set
        let mut t = Task {
            id: "t".into(),
            title: "x".into(),
            context: Context::Office,
            status: TaskStatus::Done,
            created: "2026-06-07T00:00:00Z".into(),
            due: None,
            snooze_until: None,
            completed: None,
            goal_id: None,
            subtasks: vec![],
            details: String::new(),
            priority: false,
            attachments: vec![],
            committed_on: None,
            carried: 0,
        };
        apply_completed_rule(&mut t);
        assert!(t.completed.is_some(), "done should set completed");

        // done with completed already set → keep it
        let kept = "2026-01-01T00:00:00Z".to_string();
        t.completed = Some(kept.clone());
        apply_completed_rule(&mut t);
        assert_eq!(t.completed.as_ref(), Some(&kept), "should preserve existing");

        // reopened → cleared
        t.status = TaskStatus::Open;
        apply_completed_rule(&mut t);
        assert_eq!(t.completed, None, "open should clear completed");

        // dropped → cleared
        t.status = TaskStatus::Dropped;
        t.completed = Some(kept);
        apply_completed_rule(&mut t);
        assert_eq!(t.completed, None, "dropped should clear completed");
    }

    #[test]
    fn delete_goal_clears_links_and_trashes_goal() {
        let vault = temp_vault();

        let goal = Goal {
            id: "g1".into(),
            title: "Goal".into(),
            description: String::new(),
            context: Context::Office,
            status: GoalStatus::Active,
            target: None,
            created: "2026-06-01T00:00:00Z".into(),
            updated: "2026-06-01T00:00:00Z".into(),
        };
        store_io::write_goal(&vault, &goal).unwrap();

        let linked_task = Task {
            id: "t1".into(),
            title: "linked".into(),
            context: Context::Office,
            status: TaskStatus::Open,
            created: "2026-06-02T00:00:00Z".into(),
            due: None,
            snooze_until: None,
            completed: None,
            goal_id: Some("g1".into()),
            subtasks: vec![],
            details: String::new(),
            priority: false,
            attachments: vec![],
            committed_on: None,
            carried: 0,
        };
        store_io::write_task(&vault, &linked_task).unwrap();

        let unlinked_task = Task {
            goal_id: Some("other".into()),
            id: "t2".into(),
            ..linked_task.clone()
        };
        store_io::write_task(&vault, &unlinked_task).unwrap();

        let linked_note = Note {
            id: "n1".into(),
            title: "linked note".into(),
            context: Context::Office,
            goal_id: Some("g1".into()),
            notebook_id: None,
            created: "2026-06-02T00:00:00Z".into(),
            updated: "2026-06-02T00:00:00Z".into(),
            attachments: vec![],
        };
        store_io::write_note(&vault, &linked_note, "keep this body").unwrap();

        let result = clear_links_and_trash(&vault, "g1").unwrap();

        assert_eq!(result.cleared_task_ids, vec!["t1".to_string()]);
        assert_eq!(result.cleared_note_ids, vec!["n1".to_string()]);

        // Linked task now has null goalId; unlinked task untouched.
        assert_eq!(store_io::read_task(&vault, "t1").unwrap().goal_id, None);
        assert_eq!(
            store_io::read_task(&vault, "t2").unwrap().goal_id.as_deref(),
            Some("other")
        );

        // Linked note cleared but body preserved.
        let n = store_io::read_note_meta(&vault, "n1").unwrap();
        assert_eq!(n.goal_id, None);
        assert_eq!(store_io::read_note_body(&vault, "n1").unwrap(), "keep this body");

        // Goal moved to trash.
        assert!(!store_io::entity_path(&vault, EntityKind::Goal, "g1").exists());
        assert!(vault.join(".atlas/trash/g1.json").exists());
    }

    #[test]
    fn delete_notebook_unfiles_notes_and_preserves_them() {
        let vault = temp_vault();

        let notebook = Notebook {
            id: "nb1".into(),
            name: "Work".into(),
            context: Context::Office,
            created: "2026-06-01T00:00:00Z".into(),
            updated: "2026-06-01T00:00:00Z".into(),
        };
        store_io::write_notebook(&vault, &notebook).unwrap();

        let member = Note {
            id: "n1".into(),
            title: "filed".into(),
            context: Context::Office,
            goal_id: None,
            notebook_id: Some("nb1".into()),
            created: "2026-06-02T00:00:00Z".into(),
            updated: "2026-06-02T00:00:00Z".into(),
            attachments: vec![],
        };
        store_io::write_note(&vault, &member, "keep me").unwrap();

        // A note in a different notebook must be left untouched.
        let other = Note {
            id: "n2".into(),
            notebook_id: Some("other".into()),
            ..member.clone()
        };
        store_io::write_note(&vault, &other, "other body").unwrap();

        let cleared = clear_notebook_notes(&vault, "nb1").unwrap();
        store_io::move_to_trash(&vault, EntityKind::Notebook, "nb1").unwrap();

        assert_eq!(cleared, vec!["n1".to_string()]);

        // Member unfiled, body preserved.
        let n1 = store_io::read_note_meta(&vault, "n1").unwrap();
        assert_eq!(n1.notebook_id, None);
        assert_eq!(store_io::read_note_body(&vault, "n1").unwrap(), "keep me");

        // Note in another notebook untouched.
        let n2 = store_io::read_note_meta(&vault, "n2").unwrap();
        assert_eq!(n2.notebook_id.as_deref(), Some("other"));

        // Notebook moved to trash.
        assert!(!store_io::entity_path(&vault, EntityKind::Notebook, "nb1").exists());
        assert!(vault.join(".atlas/trash/nb1.json").exists());
    }

    /// Test helper mirroring `delete_goal`'s logic without an `AppHandle`.
    fn clear_links_and_trash(vault: &Path, id: &str) -> AppResult<GoalDeletionResult> {
        let cleared_task_ids = clear_linked_tasks(vault, id)?;
        let cleared_note_ids = clear_linked_notes(vault, id)?;
        store_io::move_to_trash(vault, EntityKind::Goal, id)?;
        Ok(GoalDeletionResult {
            cleared_task_ids,
            cleared_note_ids,
        })
    }

    /// Test helper mirroring `delete_task`'s logic without an `AppHandle`.
    fn delete_task_and_attachments(vault: &Path, id: &str) -> AppResult<()> {
        store_io::move_to_trash(vault, EntityKind::Task, id)?;
        store_io::move_attachment_path_to_trash(vault, &Path::new("attachments").join(id))
    }

    /// Test helper mirroring `delete_note`'s logic without an `AppHandle`.
    fn delete_note_and_attachments(vault: &Path, id: &str) -> AppResult<()> {
        store_io::move_to_trash(vault, EntityKind::Note, id)?;
        store_io::move_attachment_path_to_trash(vault, &Path::new("attachments").join(id))
    }

    #[test]
    fn delete_task_takes_its_attachments_folder_to_trash() {
        let vault = temp_vault();
        store_io::write_task(&vault, &sample_task_for_test("t1")).unwrap();
        store_io::copy_attachment(
            &vault,
            "t1",
            &write_source_file(&vault, "report.pdf", b"data"),
            "2026-06-01T00:00:00Z",
        )
        .unwrap();

        delete_task_and_attachments(&vault, "t1").unwrap();

        assert!(!store_io::entity_path(&vault, EntityKind::Task, "t1").exists());
        assert!(!vault.join("attachments/t1").exists());
        assert!(vault
            .join(".atlas/trash/attachments/t1/report.pdf")
            .exists());
    }

    #[test]
    fn delete_task_without_attachments_folder_still_succeeds() {
        let vault = temp_vault();
        store_io::write_task(&vault, &sample_task_for_test("t-no-attachments")).unwrap();
        delete_task_and_attachments(&vault, "t-no-attachments").unwrap();
        assert!(!store_io::entity_path(&vault, EntityKind::Task, "t-no-attachments").exists());
    }

    #[test]
    fn delete_note_takes_its_attachments_folder_to_trash() {
        let vault = temp_vault();
        let note = Note {
            id: "n1".into(),
            title: "Note".into(),
            context: Context::Office,
            goal_id: None,
            notebook_id: None,
            created: "2026-06-01T00:00:00Z".into(),
            updated: "2026-06-01T00:00:00Z".into(),
            attachments: vec![],
        };
        store_io::write_note(&vault, &note, "see [report](attachments/n1/report.pdf)").unwrap();
        store_io::copy_attachment(
            &vault,
            "n1",
            &write_source_file(&vault, "report.pdf", b"data"),
            "2026-06-01T00:00:00Z",
        )
        .unwrap();

        delete_note_and_attachments(&vault, "n1").unwrap();

        assert!(!store_io::entity_path(&vault, EntityKind::Note, "n1").exists());
        assert!(!vault.join("attachments/n1").exists());
        assert!(vault
            .join(".atlas/trash/attachments/n1/report.pdf")
            .exists());
    }

    /// A minimal, fully-populated `Task` for tests that don't care about its
    /// fields beyond the id.
    fn sample_task_for_test(id: &str) -> Task {
        Task {
            id: id.into(),
            title: "x".into(),
            context: Context::Office,
            status: TaskStatus::Open,
            created: "2026-06-01T00:00:00Z".into(),
            due: None,
            snooze_until: None,
            completed: None,
            goal_id: None,
            subtasks: vec![],
            details: String::new(),
            priority: false,
            attachments: vec![],
            committed_on: None,
            carried: 0,
        }
    }

    /// Write a scratch source file (outside the vault) for `copy_attachment`
    /// tests to copy in.
    fn write_source_file(vault: &Path, name: &str, bytes: &[u8]) -> PathBuf {
        let dir = vault.join("_scratch_source");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, bytes).unwrap();
        path
    }
}
