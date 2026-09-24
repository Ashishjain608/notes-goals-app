//! The `#[tauri::command]` surface. Names and argument keys mirror
//! `src/lib/ipc.ts` exactly; Tauri maps camelCase JS keys to snake_case Rust
//! params. Every command resolves the vault from `config.json` on each call
//! (stateless — ADR-0006) and returns `Result<T, AppError>`. Each command is a
//! thin Tauri adapter: resolve the vault (and anything else that genuinely
//! needs the `AppHandle`), then delegate to `ops` for the actual logic.

use std::path::Path;

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, AppResult};
use crate::model::{
    Attachment, CreateGoalInput, CreateNoteInput, CreateNotebookInput, CreateTaskInput, Goal,
    GoalDeletionResult, Note, NoteBodyHit, Notebook, NotebookDeletionResult, StoreSnapshot, Task,
};
use crate::ops;
use crate::store_io;
use crate::vault;

/* -------------------------------------------------------------------- Vault */

/// The persisted vault path, but only if the folder exists and is readable.
#[tauri::command]
pub fn get_vault_path(app: AppHandle) -> AppResult<Option<String>> {
    Ok(vault::resolve_existing_vault(&app))
}

/// The raw configured vault path, even if the folder is currently missing.
/// Used by VaultGate to show "your data folder isn't available" (with the
/// path) instead of the first-run screen when a vault was configured but its
/// folder is gone (e.g. an unmounted drive).
#[tauri::command]
pub fn get_configured_vault_path(app: AppHandle) -> AppResult<Option<String>> {
    Ok(vault::configured_vault_path(&app))
}

/// Open a native folder picker; on pick, initialize + persist the vault and
/// return its path. On cancel, return `None`. On first run the picker starts in
/// Documents with New Folder available — VaultGate's steps describe exactly
/// that. A folder that already holds unrelated files asks first, and "Choose
/// Another…" reopens the picker. Async so the blocking dialogs run off the
/// main thread.
#[tauri::command]
pub async fn choose_vault(app: AppHandle) -> AppResult<Option<String>> {
    loop {
        let mut picker = app
            .dialog()
            .file()
            .set_title("Choose a data folder for Notes & Goals")
            .set_can_create_directories(true);
        if vault::configured_vault_path(&app).is_none() {
            if let Ok(documents) = app.path().document_dir() {
                picker = picker.set_directory(documents);
            }
        }
        let Some(picked) = picker.blocking_pick_folder() else {
            return Ok(None);
        };
        let path = picked
            .into_path()
            .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
        if vault::has_unrelated_files(&path) && !confirm_folder_with_files(&app, &path) {
            continue;
        }
        return Ok(Some(vault::initialize_vault(&app, &path)?));
    }
}

/// Ask before turning a folder that already holds other files into a vault.
/// True means "use it anyway".
fn confirm_folder_with_files(app: &AppHandle, path: &Path) -> bool {
    let name = path
        .file_name()
        .map_or_else(|| path.display().to_string(), |n| n.to_string_lossy().into_owned());
    app.dialog()
        .message(format!(
            "“{name}” already has other files in it. Notes & Goals will add its own folders \
             (tasks, notes, goals and a few more) next to them.\n\n\
             For a tidy setup, choose an empty folder or make a new one."
        ))
        .title("Use a folder that isn’t empty?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Use This Folder".into(),
            "Choose Another…".into(),
        ))
        .blocking_show()
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
/// Runs off the main thread because an iCloud-synced vault may first have to
/// download its files; the window keeps painting the loading screen meanwhile.
#[tauri::command(async)]
pub fn load_all(app: AppHandle) -> AppResult<StoreSnapshot> {
    ops::load_all(&vault::require_vault(&app)?)
}

/// Lazily read a single note's markdown body (frontmatter stripped).
#[tauri::command]
pub fn load_note_body(app: AppHandle, id: String) -> AppResult<String> {
    store_io::read_note_body(&vault::require_vault(&app)?, &id)
}

/// Search every note's markdown body for `query`, returning at most 20 hits
/// with a one-line excerpt each. Titles/goals/tasks are already in the frontend
/// store and are matched there; only bodies need this trip to disk (ADR-0006).
#[tauri::command]
pub fn search_note_bodies(app: AppHandle, query: String) -> AppResult<Vec<NoteBodyHit>> {
    Ok(store_io::search_note_bodies(&vault::require_vault(&app)?, &query, 20))
}

/* -------------------------------------------------------------------- Tasks */

/// Create a task: Rust owns id + `created`; status `open`, no completed, empty
/// subtasks; due/goalId pass through from input.
#[tauri::command]
pub fn create_task(app: AppHandle, input: CreateTaskInput) -> AppResult<Task> {
    ops::create_task(&vault::require_vault(&app)?, input)
}

/// Persist an edited task, enforcing the `completed` rule idempotently from the
/// incoming status — see `ops::update_task`.
#[tauri::command]
pub fn update_task(app: AppHandle, task: Task) -> AppResult<Task> {
    ops::update_task(&vault::require_vault(&app)?, task)
}

/// Hard-delete a task by moving its file to trash (ADR-0003), taking its
/// `attachments/<id>/` folder with it if one exists.
#[tauri::command]
pub fn delete_task(app: AppHandle, id: String) -> AppResult<()> {
    ops::delete_task(&vault::require_vault(&app)?, &id)
}

/* -------------------------------------------------------------------- Notes */

/// Create a note: Rust owns id and `created == updated == now`. Writes the `.md`
/// file with the initial body (or empty) and returns the metadata.
#[tauri::command]
pub fn create_note(app: AppHandle, input: CreateNoteInput) -> AppResult<Note> {
    ops::create_note(&vault::require_vault(&app)?, input)
}

/// Persist an edited note + body: bump `updated`, preserve `created`, rewrite
/// the `.md`, and return the updated metadata.
#[tauri::command]
pub fn update_note(app: AppHandle, note: Note, body: String) -> AppResult<Note> {
    ops::update_note(&vault::require_vault(&app)?, note, body)
}

/// Hard-delete a note by moving its file to trash — the only removal path for
/// notes (ADR-0003) — taking its `attachments/<id>/` folder with it if one
/// exists.
#[tauri::command]
pub fn delete_note(app: AppHandle, id: String) -> AppResult<()> {
    ops::delete_note(&vault::require_vault(&app)?, &id)
}

/// File a note into a notebook (or `None` to unfile) — see `ops::move_note`.
#[tauri::command]
pub fn move_note(app: AppHandle, id: String, notebook_id: Option<String>) -> AppResult<Note> {
    ops::move_note(&vault::require_vault(&app)?, &id, notebook_id)
}

/* ---------------------------------------------------------------- Notebooks */

/// Create a notebook: Rust owns id and `created == updated == now`. Its context
/// is fixed here and never changes afterward (ADR-0008).
#[tauri::command]
pub fn create_notebook(app: AppHandle, input: CreateNotebookInput) -> AppResult<Notebook> {
    ops::create_notebook(&vault::require_vault(&app)?, input)
}

/// Persist an edited notebook (rename): bump `updated`, rewrite, return. Context
/// is immutable by convention (ADR-0008), so only the name is expected to change.
#[tauri::command]
pub fn update_notebook(app: AppHandle, notebook: Notebook) -> AppResult<Notebook> {
    ops::update_notebook(&vault::require_vault(&app)?, notebook)
}

/// Delete a notebook: clear the `notebookId` pointer on every note filed in it,
/// move the notebook file to trash, and report which notes were unfiled — see
/// `ops::delete_notebook`.
#[tauri::command]
pub fn delete_notebook(app: AppHandle, id: String) -> AppResult<NotebookDeletionResult> {
    ops::delete_notebook(&vault::require_vault(&app)?, &id)
}

/* -------------------------------------------------------------------- Goals */

/// Create a goal: Rust owns id and `created == updated == now`; status `active`;
/// description defaults to empty.
#[tauri::command]
pub fn create_goal(app: AppHandle, input: CreateGoalInput) -> AppResult<Goal> {
    ops::create_goal(&vault::require_vault(&app)?, input)
}

/// Persist an edited goal: bump `updated`, rewrite, return.
#[tauri::command]
pub fn update_goal(app: AppHandle, goal: Goal) -> AppResult<Goal> {
    ops::update_goal(&vault::require_vault(&app)?, goal)
}

/// Delete a goal: clear the `goalId` pointer on every linked task and note,
/// move the goal file to trash, and report which ids were cleared — see
/// `ops::delete_goal`.
#[tauri::command]
pub fn delete_goal(app: AppHandle, id: String) -> AppResult<GoalDeletionResult> {
    ops::delete_goal(&vault::require_vault(&app)?, &id)
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
    ops::attach_files(&vault::require_vault(&app)?, &entity_id, &paths)
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
    ops::attach_bytes(&vault::require_vault(&app)?, &entity_id, &name, &bytes)
}

/// Move an attachment file to trash — never unlinked (ADR-0003). `path` is
/// untrusted and validated hard against path traversal.
#[tauri::command]
pub fn remove_attachment(app: AppHandle, path: String) -> AppResult<()> {
    ops::remove_attachment(&vault::require_vault(&app)?, &path)
}

/// Open an attachment in the OS default app. `path` is untrusted and
/// validated hard against path traversal. Needs the `AppHandle` for the
/// opener plugin, so only the path resolution delegates to `store_io`.
#[tauri::command]
pub fn open_attachment(app: AppHandle, path: String) -> AppResult<()> {
    let vault = vault::require_vault(&app)?;
    let absolute = store_io::resolve_attachment_path(&vault, &path)?;
    app.opener()
        .open_path(absolute.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))
}
