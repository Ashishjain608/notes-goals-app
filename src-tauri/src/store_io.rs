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
use crate::model::{Attachment, Goal, Note, Notebook, Task};

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

/// A sibling `.tmp` path for `target`, distinct per target so concurrent
/// writes to different files never collide on the temp path.
fn tmp_sibling(target: &Path) -> PathBuf {
    target.with_extension(format!(
        "{}.tmp",
        target.extension().and_then(|e| e.to_str()).unwrap_or("")
    ))
}

/// Atomically write `contents` to `target`: write a sibling `.tmp` file,
/// `sync_all()` it to disk, then `rename` over the target. The rename is atomic
/// on the same filesystem, so a reader never observes a half-written file.
pub fn atomic_write(target: &Path, contents: &str) -> AppResult<()> {
    atomic_write_bytes(target, contents.as_bytes())
}

/// Byte-oriented counterpart to `atomic_write`, used for binary content
/// (attachments) rather than text.
fn atomic_write_bytes(target: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = tmp_sibling(target);

    {
        let mut file = File::create(&tmp)?;
        file.write_all(bytes)?;
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

/// Move an arbitrary vault-relative path (file or directory) into
/// `.atlas/trash/`, preserving its relative location so attachment filenames
/// from different entities never collide in the trash (ADR-0003 — never
/// unlinked). A missing source is a no-op, not an error, since callers use
/// this for optional cleanup (e.g. a task's attachments folder may not
/// exist). If the destination directory already exists (a single attachment
/// under it was trashed earlier), its contents are merged in rather than
/// failing a rename-onto-existing-directory.
pub fn move_attachment_path_to_trash(vault: &Path, rel_path: &Path) -> AppResult<()> {
    let source = vault.join(rel_path);
    if !source.exists() {
        return Ok(());
    }
    let dest = vault.join(".atlas").join("trash").join(rel_path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    if source.is_dir() && dest.exists() {
        // ponytail: same-name re-trash after remove-then-reattach can
        // overwrite an older trashed copy; suffix on merge collision if that
        // ever matters in practice.
        for entry in fs::read_dir(&source)? {
            let entry = entry?;
            fs::rename(entry.path(), dest.join(entry.file_name()))?;
        }
        fs::remove_dir(&source)?;
    } else {
        fs::rename(&source, &dest)?;
    }
    Ok(())
}

/* ------------------------------------------------------------- attachments */

/// The `attachments/<entityId>/` folder for a task or note.
fn attachments_dir(vault: &Path, entity_id: &str) -> PathBuf {
    vault.join("attachments").join(entity_id)
}

/// Reject an entity id that isn't a single safe path segment — it gets
/// embedded directly into `attachments/<entityId>/`, so it's a trust boundary
/// exactly like any other incoming path.
fn sanitize_entity_id(entity_id: &str) -> AppResult<&str> {
    let safe = !entity_id.is_empty()
        && entity_id != "."
        && entity_id != ".."
        && !entity_id.contains('/')
        && !entity_id.contains('\\');
    if safe {
        Ok(entity_id)
    } else {
        Err(AppError::InvalidAttachmentPath(entity_id.to_string()))
    }
}

/// Sanitize an untrusted filename (e.g. from clipboard paste) down to a bare
/// filename with no directory components, falling back to a generic name if
/// nothing usable remains.
fn sanitize_filename(name: &str) -> String {
    let base = Path::new(name.trim())
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if base.is_empty() {
        "attachment".to_string()
    } else {
        base.to_string()
    }
}

/// A path relative to the vault root, rendered with forward slashes (the
/// contract's POSIX-relative format) regardless of host path separator.
fn vault_relative_posix(vault: &Path, path: &Path) -> String {
    path.strip_prefix(vault)
        .unwrap_or(path)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// The first available destination for `name` inside `dir`: `report.pdf` if
/// free, else `report-1.pdf`, `report-2.pdf`, … — preserving the extension so
/// two attachments with the same name never clobber each other.
fn unique_attachment_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name);
    let ext = Path::new(name).extension().and_then(|e| e.to_str());
    let mut n: u32 = 1;
    loop {
        let candidate_name = match ext {
            Some(ext) => format!("{stem}-{n}.{ext}"),
            None => format!("{stem}-{n}"),
        };
        let candidate = dir.join(&candidate_name);
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

/// Copy an existing file at `source` (an absolute host path, e.g. from the
/// native file picker) into `<vault>/attachments/<entity_id>/`, suffixing on
/// filename collision. Copies via a temp file + rename so a reader never sees
/// a partially copied file under the final name.
pub fn copy_attachment(
    vault: &Path,
    entity_id: &str,
    source: &Path,
    added: &str,
) -> AppResult<Attachment> {
    let entity_id = sanitize_entity_id(entity_id)?;
    let name = source
        .file_name()
        .and_then(|n| n.to_str())
        .map(sanitize_filename)
        .ok_or_else(|| AppError::InvalidAttachmentPath("source has no filename".to_string()))?;

    let dir = attachments_dir(vault, entity_id);
    fs::create_dir_all(&dir)?;
    let dest = unique_attachment_path(&dir, &name);
    let tmp = tmp_sibling(&dest);
    fs::copy(source, &tmp)?;
    let size = fs::metadata(&tmp)?.len();
    fs::rename(&tmp, &dest)?;

    Ok(Attachment {
        path: vault_relative_posix(vault, &dest),
        name: dest
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&name)
            .to_string(),
        size,
        added: added.to_string(),
    })
}

/// Write `bytes` (e.g. from a clipboard paste) as a new attachment named
/// `name` under `<vault>/attachments/<entity_id>/`, suffixing on filename
/// collision. `name` is untrusted and sanitized to a bare filename.
pub fn write_attachment(
    vault: &Path,
    entity_id: &str,
    name: &str,
    bytes: &[u8],
    added: &str,
) -> AppResult<Attachment> {
    let entity_id = sanitize_entity_id(entity_id)?;
    let name = sanitize_filename(name);

    let dir = attachments_dir(vault, entity_id);
    fs::create_dir_all(&dir)?;
    let dest = unique_attachment_path(&dir, &name);
    atomic_write_bytes(&dest, bytes)?;

    Ok(Attachment {
        path: vault_relative_posix(vault, &dest),
        name: dest
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&name)
            .to_string(),
        size: bytes.len() as u64,
        added: added.to_string(),
    })
}

/// Validate an untrusted vault-relative attachment path (as sent back from
/// the frontend for `remove_attachment` / `open_attachment`) and resolve it
/// to an absolute path inside the vault. This is the trust boundary: rejects
/// anything that isn't a plain `attachments/<id>/<name>` relative path — no
/// `..`, no absolute paths, no other top-level folder — and, since the file
/// must already exist for both callers, double-checks containment after
/// canonicalization so a symlink planted under the vault can't be used to
/// escape it.
pub fn resolve_attachment_path(vault: &Path, rel_path: &str) -> AppResult<PathBuf> {
    let rel = Path::new(rel_path);
    let all_normal = rel
        .components()
        .all(|c| matches!(c, std::path::Component::Normal(_)));
    let starts_with_attachments = matches!(
        rel.components().next(),
        Some(std::path::Component::Normal(s)) if s == "attachments"
    );
    if !all_normal || !starts_with_attachments || rel.components().count() < 3 {
        return Err(AppError::InvalidAttachmentPath(rel_path.to_string()));
    }

    let candidate = vault.join(rel);
    if !candidate.exists() {
        return Err(AppError::NotFound(rel_path.to_string()));
    }

    let vault_canon = vault.canonicalize()?;
    let candidate_canon = candidate.canonicalize()?;
    if !candidate_canon.starts_with(&vault_canon) {
        return Err(AppError::InvalidAttachmentPath(rel_path.to_string()));
    }

    Ok(candidate)
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
    /// Mirrors `Note::attachments` verbatim (unlike the pointer fields above,
    /// an empty list is written as `[]` rather than omitted — a Vec has no
    /// "blank string" convention to reuse, and an explicit `[]` is just as
    /// clean while staying consistent with how a task's `attachments` field
    /// is always present in its JSON). `#[serde(default)]` so notes written
    /// before attachments existed still parse.
    #[serde(default)]
    attachments: Vec<Attachment>,
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
            attachments: note.attachments.clone(),
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
            attachments: self.attachments,
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
            attachments: vec![],
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
            attachments: vec![],
        }
    }

    fn sample_attachment(name: &str) -> Attachment {
        Attachment {
            path: format!("attachments/note-1/{name}"),
            name: name.to_string(),
            size: 9,
            added: "2026-06-07T00:00:00Z".to_string(),
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
        assert!(loaded.attachments.is_empty());
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
    fn note_round_trips_attachments() {
        let vault = temp_vault();
        let note = Note {
            attachments: vec![sample_attachment("report.pdf"), sample_attachment("plan.md")],
            ..sample_note("note-att", None)
        };
        let body = "Some prose, no inline links here.";
        write_note(&vault, &note, body).unwrap();

        // Body is untouched by the frontmatter change — still byte-identical.
        assert_eq!(read_note_body(&vault, "note-att").unwrap(), body);

        let meta = read_note_meta(&vault, "note-att").unwrap();
        assert_eq!(meta.attachments, note.attachments);
    }

    #[test]
    fn note_without_attachments_field_defaults_to_empty() {
        // A note written before attachments existed (no `attachments` key in
        // its YAML) must still load, defaulting to an empty list.
        let vault = temp_vault();
        let legacy = "---\nid: legacy-note\ntitle: Old note\ncontext: office\ngoalId: ''\nnotebookId: ''\ncreated: 2026-06-03T09:12:00Z\nupdated: 2026-06-04T11:00:00Z\n---\nbody\n";
        fs::write(entity_path(&vault, EntityKind::Note, "legacy-note"), legacy).unwrap();

        let meta = read_note_meta(&vault, "legacy-note").unwrap();
        assert!(meta.attachments.is_empty());
    }

    #[test]
    fn metadata_only_rewrite_preserves_body_and_attachments() {
        // The storage guarantee `move_note` relies on, now with attachments
        // present: change metadata, keep body and attachments both.
        let vault = temp_vault();
        let note = Note {
            attachments: vec![sample_attachment("report.pdf")],
            ..sample_note("note-move-att", None)
        };
        write_note(&vault, &note, "the precious body").unwrap();

        let mut meta = read_note_meta(&vault, "note-move-att").unwrap();
        meta.notebook_id = Some("nb-dest".to_string());
        let body = read_note_body(&vault, "note-move-att").unwrap();
        write_note(&vault, &meta, &body).unwrap();

        let after = read_note_meta(&vault, "note-move-att").unwrap();
        assert_eq!(after.notebook_id.as_deref(), Some("nb-dest"));
        assert_eq!(after.attachments, note.attachments);
        assert_eq!(
            read_note_body(&vault, "note-move-att").unwrap(),
            "the precious body"
        );
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

    /* ------------------------------------------------------- attachments --- */

    #[test]
    fn copy_attachment_lands_in_entity_folder_with_extension_preserved() {
        let vault = temp_vault();
        let source_dir = std::env::temp_dir().join(format!("ng-src-{}", std::process::id()));
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("report.pdf");
        fs::write(&source, b"pdf bytes").unwrap();

        let att = copy_attachment(&vault, "task-1", &source, "2026-06-07T00:00:00Z").unwrap();

        assert_eq!(att.path, "attachments/task-1/report.pdf");
        assert_eq!(att.name, "report.pdf");
        assert_eq!(att.size, 9);
        assert!(vault.join("attachments/task-1/report.pdf").exists());
    }

    #[test]
    fn copy_attachment_suffixes_on_collision() {
        let vault = temp_vault();
        let source_dir = std::env::temp_dir().join(format!("ng-src-{}", std::process::id() + 1));
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("report.pdf");
        fs::write(&source, b"first").unwrap();

        let first = copy_attachment(&vault, "task-1", &source, "t").unwrap();
        fs::write(&source, b"second").unwrap();
        let second = copy_attachment(&vault, "task-1", &source, "t").unwrap();

        assert_eq!(first.path, "attachments/task-1/report.pdf");
        assert_eq!(second.path, "attachments/task-1/report-1.pdf");
        // Both files survive with their own contents — no clobbering.
        assert_eq!(
            fs::read_to_string(vault.join(&first.path)).unwrap(),
            "first"
        );
        assert_eq!(
            fs::read_to_string(vault.join(&second.path)).unwrap(),
            "second"
        );
    }

    #[test]
    fn write_attachment_sanitizes_untrusted_name() {
        let vault = temp_vault();
        let att = write_attachment(&vault, "task-1", "../../etc/evil.txt", b"x", "t").unwrap();
        assert_eq!(att.path, "attachments/task-1/evil.txt");
        assert!(vault.join("attachments/task-1/evil.txt").exists());
    }

    #[test]
    fn resolve_attachment_path_rejects_traversal_and_absolute_and_wrong_prefix() {
        let vault = temp_vault();
        write_attachment(&vault, "task-1", "report.pdf", b"x", "t").unwrap();

        assert!(resolve_attachment_path(&vault, "attachments/task-1/../../../etc/passwd").is_err());
        assert!(resolve_attachment_path(&vault, "/etc/passwd").is_err());
        assert!(resolve_attachment_path(&vault, "tasks/task-1.json").is_err());
        assert!(resolve_attachment_path(&vault, "attachments/task-1/report.pdf").is_ok());
    }

    #[test]
    fn remove_attachment_moves_file_to_trash() {
        let vault = temp_vault();
        let att = write_attachment(&vault, "task-1", "report.pdf", b"x", "t").unwrap();

        let absolute = resolve_attachment_path(&vault, &att.path).unwrap();
        let relative = absolute.strip_prefix(&vault).unwrap().to_path_buf();
        move_attachment_path_to_trash(&vault, &relative).unwrap();

        assert!(!vault.join(&att.path).exists());
        assert!(vault.join(".atlas/trash/attachments/task-1/report.pdf").exists());
    }

    #[test]
    fn move_attachment_path_to_trash_missing_folder_is_not_an_error() {
        let vault = temp_vault();
        move_attachment_path_to_trash(&vault, Path::new("attachments/no-such-task")).unwrap();
    }

    #[test]
    fn move_attachment_path_to_trash_merges_into_existing_trashed_folder() {
        let vault = temp_vault();
        write_attachment(&vault, "task-1", "a.txt", b"a", "t").unwrap();
        move_attachment_path_to_trash(&vault, Path::new("attachments/task-1")).unwrap();

        // Recreate the folder with a second attachment and trash it again.
        write_attachment(&vault, "task-1", "b.txt", b"b", "t").unwrap();
        move_attachment_path_to_trash(&vault, Path::new("attachments/task-1")).unwrap();

        assert!(vault.join(".atlas/trash/attachments/task-1/a.txt").exists());
        assert!(vault.join(".atlas/trash/attachments/task-1/b.txt").exists());
    }
}
