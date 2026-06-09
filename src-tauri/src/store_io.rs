//! Filesystem I/O for the vault: per-entity paths, atomic writes, trash moves,
//! JSON (tasks/goals) and YAML-frontmatter (notes) (de)serialization, and a
//! resilient `load_all` that skips individual bad files rather than failing the
//! whole load.
//!
//! Every write is atomic — `<file>.tmp` → `sync_all` → `rename` over the target
//! (ADR-0006). Deletes *move* files into `.atlas/trash/`, never `unlink` them
//! (ADR-0003).

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::model::{Goal, Note, Notebook, Task};

/// The kind of entity, used to derive subfolder + extension.
#[derive(Debug, Clone, Copy)]
pub enum EntityKind {
    Task,
    Goal,
    Note,
    Notebook,
}

impl EntityKind {
    fn subfolder(self) -> &'static str {
        match self {
            EntityKind::Task => "tasks",
            EntityKind::Goal => "goals",
            EntityKind::Note => "notes",
            EntityKind::Notebook => "notebooks",
        }
    }

    fn extension(self) -> &'static str {
        match self {
            EntityKind::Task | EntityKind::Goal | EntityKind::Notebook => "json",
            EntityKind::Note => "md",
        }
    }
}

/// Path to an entity file inside the vault, e.g. `<vault>/tasks/<id>.json`.
pub fn entity_path(vault: &Path, kind: EntityKind, id: &str) -> PathBuf {
    vault
        .join(kind.subfolder())
        .join(format!("{id}.{}", kind.extension()))
}

/* ------------------------------------------------------------- atomic write */

/// Atomically write `contents` to `target`: write a sibling `.tmp` file,
/// `sync_all()` it to disk, then `rename` over the target. The rename is atomic
/// on the same filesystem, so a reader never observes a half-written file.
pub fn atomic_write(target: &Path, contents: &str) -> AppResult<()> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    // Distinct temp name per target keeps concurrent writes to different files
    // from colliding on the temp path.
    let tmp = target.with_extension(format!(
        "{}.tmp",
        target.extension().and_then(|e| e.to_str()).unwrap_or("")
    ));

    {
        let mut file = File::create(&tmp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
    }

    fs::rename(&tmp, target)?;
    Ok(())
}

/* -------------------------------------------------------------------- trash */

/// Move an entity file into `.atlas/trash/`, preserving its filename. Never
/// unlinks the user's only copy (ADR-0003). A missing source is an error so the
/// caller can report "not found".
pub fn move_to_trash(vault: &Path, kind: EntityKind, id: &str) -> AppResult<()> {
    let source = entity_path(vault, kind, id);
    if !source.exists() {
        return Err(AppError::NotFound(format!(
            "{}/{id}",
            kind.subfolder()
        )));
    }
    let trash_dir = vault.join(".atlas").join("trash");
    fs::create_dir_all(&trash_dir)?;
    let file_name = source
        .file_name()
        .ok_or_else(|| AppError::NotFound(format!("{}/{id}", kind.subfolder())))?;
    fs::rename(&source, trash_dir.join(file_name))?;
    Ok(())
}

/* ------------------------------------------------------------- JSON entities */

/// Serialize a task to pretty 2-space JSON and write it atomically.
pub fn write_task(vault: &Path, task: &Task) -> AppResult<()> {
    write_json(vault, EntityKind::Task, &task.id, task)
}

/// Serialize a goal to pretty 2-space JSON and write it atomically.
pub fn write_goal(vault: &Path, goal: &Goal) -> AppResult<()> {
    write_json(vault, EntityKind::Goal, &goal.id, goal)
}

/// Serialize a notebook to pretty 2-space JSON and write it atomically.
pub fn write_notebook(vault: &Path, notebook: &Notebook) -> AppResult<()> {
    write_json(vault, EntityKind::Notebook, &notebook.id, notebook)
}

fn write_json<T: Serialize>(
    vault: &Path,
    kind: EntityKind,
    id: &str,
    value: &T,
) -> AppResult<()> {
    let json = serde_json::to_string_pretty(value)?;
    atomic_write(&entity_path(vault, kind, id), &json)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> AppResult<T> {
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

/* -------------------------------------------------------- note frontmatter */

/// The YAML frontmatter block of a note. `goalId` is represented as an empty
/// string in YAML for the null case (and parsed back to `None`).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Frontmatter {
    id: String,
    title: String,
    context: crate::model::Context,
    /// Empty string == no goal; serialized verbatim so the file stays clean.
    goal_id: String,
    /// Empty string == Unfiled. `#[serde(default)]` so notes written before
    /// notebooks existed still parse (ADR-0008).
    #[serde(default)]
    notebook_id: String,
    created: String,
    updated: String,
}

impl Frontmatter {
    fn from_note(note: &Note) -> Self {
        Frontmatter {
            id: note.id.clone(),
            title: note.title.clone(),
            context: note.context,
            goal_id: note.goal_id.clone().unwrap_or_default(),
            notebook_id: note.notebook_id.clone().unwrap_or_default(),
            created: note.created.clone(),
            updated: note.updated.clone(),
        }
    }

    fn into_note(self) -> Note {
        Note {
            id: self.id,
            title: self.title,
            context: self.context,
            goal_id: none_if_blank(self.goal_id),
            notebook_id: none_if_blank(self.notebook_id),
            created: self.created,
            updated: self.updated,
        }
    }
}

/// A frontmatter pointer field is stored as an empty string for the null case;
/// map blank back to `None`.
fn none_if_blank(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

/// Render a note's `.md` file: `---` YAML frontmatter `---` then the body.
fn render_note_file(note: &Note, body: &str) -> AppResult<String> {
    let yaml = serde_yaml::to_string(&Frontmatter::from_note(note))?;
    // serde_yaml already ends with a newline; one blank line separates the
    // closing delimiter from the body for readability.
    Ok(format!("---\n{yaml}---\n{body}"))
}

/// Write a note's metadata + body atomically as `notes/<id>.md`.
pub fn write_note(vault: &Path, note: &Note, body: &str) -> AppResult<()> {
    let contents = render_note_file(note, body)?;
    atomic_write(&entity_path(vault, EntityKind::Note, &note.id), &contents)
}

/// Split a note file's raw contents into `(frontmatter_yaml, body)`. Requires a
/// leading `---` line and a closing `---` line.
fn split_frontmatter(raw: &str) -> AppResult<(&str, &str)> {
    // Tolerate a leading BOM / whitespace-free first line "---".
    let rest = raw
        .strip_prefix("---\n")
        .or_else(|| raw.strip_prefix("---\r\n"))
        .ok_or_else(|| AppError::InvalidNote("missing opening frontmatter delimiter".into()))?;

    // Find the closing delimiter line.
    let mut search_start = 0;
    loop {
        let slice = &rest[search_start..];
        let Some(idx) = slice.find("---") else {
            return Err(AppError::InvalidNote(
                "missing closing frontmatter delimiter".into(),
            ));
        };
        let abs = search_start + idx;
        // The delimiter must start a line and be exactly "---" on that line.
        let at_line_start = abs == 0 || rest.as_bytes()[abs - 1] == b'\n';
        let after = &rest[abs + 3..];
        let line_only = after.is_empty()
            || after.starts_with('\n')
            || after.starts_with("\r\n");
        if at_line_start && line_only {
            let yaml = &rest[..abs];
            // Skip the delimiter and its trailing newline to get the body.
            let body = after
                .strip_prefix('\n')
                .or_else(|| after.strip_prefix("\r\n"))
                .unwrap_or(after);
            return Ok((yaml, body));
        }
        search_start = abs + 3;
    }
}

/// Parse a note file's raw contents into metadata only (body discarded).
fn parse_note_meta(raw: &str) -> AppResult<Note> {
    let (yaml, _body) = split_frontmatter(raw)?;
    let fm: Frontmatter = serde_yaml::from_str(yaml)?;
    Ok(fm.into_note())
}

/// Read just the markdown body of `notes/<id>.md` (frontmatter stripped).
pub fn read_note_body(vault: &Path, id: &str) -> AppResult<String> {
    let path = entity_path(vault, EntityKind::Note, id);
    if !path.exists() {
        return Err(AppError::NotFound(format!("notes/{id}")));
    }
    let raw = fs::read_to_string(&path)?;
    let (_yaml, body) = split_frontmatter(&raw)?;
    Ok(body.to_string())
}

/// Read a single note's metadata from disk.
#[cfg_attr(not(test), allow(dead_code))]
pub fn read_note_meta(vault: &Path, id: &str) -> AppResult<Note> {
    let path = entity_path(vault, EntityKind::Note, id);
    let raw = fs::read_to_string(&path)?;
    parse_note_meta(&raw)
}

/// Read a single task from disk.
#[cfg_attr(not(test), allow(dead_code))]
pub fn read_task(vault: &Path, id: &str) -> AppResult<Task> {
    read_json(&entity_path(vault, EntityKind::Task, id))
}

/// Read a single notebook from disk.
#[cfg_attr(not(test), allow(dead_code))]
pub fn read_notebook(vault: &Path, id: &str) -> AppResult<Notebook> {
    read_json(&entity_path(vault, EntityKind::Notebook, id))
}

/* ----------------------------------------------------------------- load_all */

/// List the `*.json` files in a vault subfolder. Returns an empty list if the
/// folder is missing (a freshly created vault may have empty subfolders).
fn list_files(vault: &Path, kind: EntityKind) -> Vec<PathBuf> {
    let dir = vault.join(kind.subfolder());
    let ext = kind.extension();
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some(ext))
        .collect()
}

/// Read every task in the vault, skipping (and logging) any unreadable or
/// malformed individual file rather than failing the whole load.
pub fn load_tasks(vault: &Path) -> Vec<Task> {
    load_collection(vault, EntityKind::Task, read_json)
}

/// Read every goal in the vault, resilient to individual bad files.
pub fn load_goals(vault: &Path) -> Vec<Goal> {
    load_collection(vault, EntityKind::Goal, read_json)
}

/// Read every notebook in the vault, resilient to individual bad files.
pub fn load_notebooks(vault: &Path) -> Vec<Notebook> {
    load_collection(vault, EntityKind::Notebook, read_json)
}

/// Read every note's *metadata* in the vault (bodies are lazy), resilient to
/// individual bad files.
pub fn load_notes(vault: &Path) -> Vec<Note> {
    load_collection(vault, EntityKind::Note, |path| {
        let raw = fs::read_to_string(path)?;
        parse_note_meta(&raw)
    })
}

/// Generic resilient loader: applies `parse` to each file of `kind`, skipping
/// failures with a stderr warning.
fn load_collection<T>(
    vault: &Path,
    kind: EntityKind,
    parse: impl Fn(&Path) -> AppResult<T>,
) -> Vec<T> {
    let mut out = Vec::new();
    for path in list_files(vault, kind) {
        match parse(&path) {
            Ok(value) => out.push(value),
            Err(err) => eprintln!(
                "[notes-goals] skipping malformed file {}: {err}",
                path.display()
            ),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Context, GoalStatus, SubtaskStatus, Subtask, TaskStatus};
    use std::sync::atomic::{AtomicU64, Ordering};

    /// A unique temp directory under the OS temp dir, with vault subfolders.
    fn temp_vault() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let pid = std::process::id();
        let dir = std::env::temp_dir().join(format!("notes-goals-test-{pid}-{n}"));
        crate::vault::ensure_subfolders(&dir).expect("create subfolders");
        dir
    }

    fn sample_task(id: &str) -> Task {
        Task {
            id: id.to_string(),
            title: "Validate RTSP frames".to_string(),
            context: Context::Office,
            status: TaskStatus::Open,
            created: "2026-06-07T06:30:00Z".to_string(),
            due: Some("2026-06-10".to_string()),
            snooze_until: None,
            completed: None,
            goal_id: Some("goal-1".to_string()),
            subtasks: vec![Subtask {
                id: "s1".to_string(),
                title: "check fps".to_string(),
                status: SubtaskStatus::Done,
            }],
            details: "Some **details** for this task.".to_string(),
            priority: true,
        }
    }

    fn sample_goal(id: &str) -> Goal {
        Goal {
            id: id.to_string(),
            title: "Ship inference engine".to_string(),
            description: "**markdown** desc".to_string(),
            context: Context::Office,
            status: GoalStatus::Active,
            target: Some("2026-12-31".to_string()),
            created: "2026-06-01T00:00:00Z".to_string(),
            updated: "2026-06-02T00:00:00Z".to_string(),
        }
    }

    fn sample_note(id: &str, goal_id: Option<&str>) -> Note {
        Note {
            id: id.to_string(),
            title: "Findings".to_string(),
            context: Context::Personal,
            goal_id: goal_id.map(String::from),
            notebook_id: None,
            created: "2026-06-03T09:12:00Z".to_string(),
            updated: "2026-06-04T11:00:00Z".to_string(),
        }
    }

    fn sample_notebook(id: &str) -> Notebook {
        Notebook {
            id: id.to_string(),
            name: "Reading".to_string(),
            context: Context::Personal,
            created: "2026-06-03T09:12:00Z".to_string(),
            updated: "2026-06-04T11:00:00Z".to_string(),
        }
    }

    #[test]
    fn task_json_round_trips() {
        let vault = temp_vault();
        let task = sample_task("task-1");
        write_task(&vault, &task).unwrap();

        // File is pretty-printed, 2-space, camelCase.
        let raw = fs::read_to_string(entity_path(&vault, EntityKind::Task, "task-1")).unwrap();
        assert!(raw.contains("\"snoozeUntil\": null"));
        assert!(raw.contains("\"goalId\": \"goal-1\""));
        assert!(raw.contains("  \"id\": \"task-1\""));

        let loaded = read_task(&vault, "task-1").unwrap();
        assert_eq!(loaded, task);
    }

    #[test]
    fn task_without_details_field_defaults_to_empty() {
        // A task file written before `details` existed must still load.
        let vault = temp_vault();
        let legacy = r#"{
  "id": "legacy",
  "title": "Old task",
  "context": "office",
  "status": "open",
  "created": "2026-06-07T06:30:00Z",
  "due": null,
  "snoozeUntil": null,
  "completed": null,
  "goalId": null,
  "subtasks": []
}"#;
        fs::write(entity_path(&vault, EntityKind::Task, "legacy"), legacy).unwrap();

        let loaded = read_task(&vault, "legacy").unwrap();
        assert_eq!(loaded.details, "");
        assert!(!loaded.priority);
    }

    #[test]
    fn goal_json_round_trips() {
        let vault = temp_vault();
        let goal = sample_goal("goal-1");
        write_goal(&vault, &goal).unwrap();
        let loaded: Goal =
            read_json(&entity_path(&vault, EntityKind::Goal, "goal-1")).unwrap();
        assert_eq!(loaded, goal);
    }

    #[test]
    fn note_frontmatter_and_body_round_trip() {
        let vault = temp_vault();
        let note = sample_note("note-1", Some("goal-7"));
        let body = "Body in **markdown**.\n\n- [ ] a task\n- [x] done\n";
        write_note(&vault, &note, body).unwrap();

        // Frontmatter is delimited and goalId is the literal id.
        let raw =
            fs::read_to_string(entity_path(&vault, EntityKind::Note, "note-1")).unwrap();
        assert!(raw.starts_with("---\n"));
        assert!(raw.contains("goalId: goal-7"));

        let meta = read_note_meta(&vault, "note-1").unwrap();
        assert_eq!(meta, note);

        let read_body = read_note_body(&vault, "note-1").unwrap();
        assert_eq!(read_body, body);
    }

    #[test]
    fn note_null_goal_id_is_empty_string_and_parses_to_none() {
        let vault = temp_vault();
        let note = sample_note("note-2", None);
        write_note(&vault, &note, "body").unwrap();

        let raw =
            fs::read_to_string(entity_path(&vault, EntityKind::Note, "note-2")).unwrap();
        // Empty string for the null case; serde_yaml emits `goalId: ''`.
        assert!(raw.contains("goalId:"));

        let meta = read_note_meta(&vault, "note-2").unwrap();
        assert_eq!(meta.goal_id, None);
    }

    #[test]
    fn notebook_json_round_trips() {
        let vault = temp_vault();
        let notebook = sample_notebook("nb-1");
        write_notebook(&vault, &notebook).unwrap();

        let raw =
            fs::read_to_string(entity_path(&vault, EntityKind::Notebook, "nb-1")).unwrap();
        assert!(raw.contains("\"context\": \"personal\""));
        assert!(raw.contains("\"name\": \"Reading\""));

        let loaded = read_notebook(&vault, "nb-1").unwrap();
        assert_eq!(loaded, notebook);
    }

    #[test]
    fn note_round_trips_notebook_id() {
        let vault = temp_vault();
        let note = Note {
            notebook_id: Some("nb-7".to_string()),
            ..sample_note("note-nb", None)
        };
        write_note(&vault, &note, "body").unwrap();

        let raw =
            fs::read_to_string(entity_path(&vault, EntityKind::Note, "note-nb")).unwrap();
        assert!(raw.contains("notebookId: nb-7"));

        let meta = read_note_meta(&vault, "note-nb").unwrap();
        assert_eq!(meta.notebook_id.as_deref(), Some("nb-7"));
    }

    #[test]
    fn note_without_notebook_id_field_defaults_to_unfiled() {
        // A note written before notebooks existed (no `notebookId` in YAML)
        // must still load, as Unfiled.
        let vault = temp_vault();
        let legacy = "---\nid: legacy-note\ntitle: Old note\ncontext: office\ngoalId: ''\ncreated: 2026-06-03T09:12:00Z\nupdated: 2026-06-04T11:00:00Z\n---\nbody\n";
        fs::write(entity_path(&vault, EntityKind::Note, "legacy-note"), legacy).unwrap();

        let meta = read_note_meta(&vault, "legacy-note").unwrap();
        assert_eq!(meta.notebook_id, None);
    }

    #[test]
    fn rewriting_notebook_id_preserves_body() {
        // The storage guarantee `move_note` relies on: change metadata, keep body.
        let vault = temp_vault();
        let note = sample_note("note-move", None);
        write_note(&vault, &note, "the precious body").unwrap();

        let mut meta = read_note_meta(&vault, "note-move").unwrap();
        meta.notebook_id = Some("nb-dest".to_string());
        let body = read_note_body(&vault, "note-move").unwrap();
        write_note(&vault, &meta, &body).unwrap();

        let after = read_note_meta(&vault, "note-move").unwrap();
        assert_eq!(after.notebook_id.as_deref(), Some("nb-dest"));
        assert_eq!(read_note_body(&vault, "note-move").unwrap(), "the precious body");
    }

    #[test]
    fn atomic_write_leaves_no_tmp_and_overwrites() {
        let vault = temp_vault();
        let target = entity_path(&vault, EntityKind::Task, "atomic");
        atomic_write(&target, "first").unwrap();
        atomic_write(&target, "second").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "second");

        // No leftover .tmp sibling.
        let leftovers: Vec<_> = fs::read_dir(vault.join("tasks"))
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().to_string_lossy().contains(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "tmp file was left behind");
    }

    #[test]
    fn move_to_trash_relocates_file() {
        let vault = temp_vault();
        let task = sample_task("trash-me");
        write_task(&vault, &task).unwrap();

        move_to_trash(&vault, EntityKind::Task, "trash-me").unwrap();

        assert!(!entity_path(&vault, EntityKind::Task, "trash-me").exists());
        assert!(vault.join(".atlas/trash/trash-me.json").exists());
    }

    #[test]
    fn load_all_skips_malformed_files() {
        let vault = temp_vault();
        write_task(&vault, &sample_task("good")).unwrap();
        // A malformed JSON file should be skipped, not crash the load.
        fs::write(entity_path(&vault, EntityKind::Task, "bad"), "{ not json").unwrap();

        let tasks = load_tasks(&vault);
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].id, "good");
    }

    #[test]
    fn load_notes_returns_metadata_only() {
        let vault = temp_vault();
        write_note(&vault, &sample_note("n", Some("g")), "secret body").unwrap();
        let notes = load_notes(&vault);
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].goal_id.as_deref(), Some("g"));
    }
}
