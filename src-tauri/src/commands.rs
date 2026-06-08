//! The `#[tauri::command]` surface. Names and argument keys mirror
//! `src/lib/ipc.ts` exactly; Tauri maps camelCase JS keys to snake_case Rust
//! params. Every command resolves the vault from `config.json` on each call
//! (stateless — ADR-0006) and returns `Result<T, AppError>`.

use std::path::Path;

use chrono::{SecondsFormat, Utc};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::model::{
    CreateGoalInput, CreateNoteInput, CreateTaskInput, Goal, GoalDeletionResult, GoalStatus, Note,
    StoreSnapshot, Task, TaskStatus,
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

/// Hard-delete a task by moving its file to trash (ADR-0003).
#[tauri::command]
pub fn delete_task(app: AppHandle, id: String) -> AppResult<()> {
    let vault = vault::require_vault(&app)?;
    store_io::move_to_trash(&vault, EntityKind::Task, &id)
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
        created: now.clone(),
        updated: now,
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
/// notes (ADR-0003).
#[tauri::command]
pub fn delete_note(app: AppHandle, id: String) -> AppResult<()> {
    let vault = vault::require_vault(&app)?;
    store_io::move_to_trash(&vault, EntityKind::Note, &id)
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
            created: "2026-06-02T00:00:00Z".into(),
            updated: "2026-06-02T00:00:00Z".into(),
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
}
