//! Vault location: the app stores only the *path* to the user's data folder,
//! nothing else outside it (CONTEXT.md). The path is persisted in
//! `<appConfigDir>/config.json` as `{ "vaultPath": "…" }` and resolved fresh on
//! every command — Rust holds no long-lived state (ADR-0006).

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

/// The on-disk app config. Currently just the chosen vault path.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    vault_path: String,
}

/// The subfolders every vault must contain.
const SUBFOLDERS: [&str; 7] = [
    "tasks",
    "notes",
    "goals",
    "notebooks",
    "attachments",
    ".atlas",
    ".atlas/trash",
];

/// Path to `<appConfigDir>/config.json`, creating the config dir if needed.
fn config_file_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("config.json"))
}

/// Read the persisted vault path, or `None` if no config exists / is unreadable.
fn read_config(app: &AppHandle) -> Option<String> {
    let path = config_file_path(app).ok()?;
    let raw = fs::read_to_string(path).ok()?;
    let config: AppConfig = serde_json::from_str(&raw).ok()?;
    Some(config.vault_path)
}

/// Persist `vault_path` to `config.json` (plain write — config dir is internal,
/// not part of the user's portable vault, so atomicity is not required here).
pub fn write_config(app: &AppHandle, vault_path: &str) -> AppResult<()> {
    let path = config_file_path(app)?;
    let config = AppConfig {
        vault_path: vault_path.to_string(),
    };
    let json = serde_json::to_string_pretty(&config)?;
    fs::write(path, json)?;
    Ok(())
}

/// True if `path` exists and is a readable directory.
fn is_readable_dir(path: &Path) -> bool {
    path.is_dir() && fs::read_dir(path).is_ok()
}

/// True when `path` already holds visible files or folders but isn't a vault,
/// i.e. choosing it would scatter the vault's subfolders among unrelated
/// things. Hidden entries (`.DS_Store`, …) don't count, and neither does a
/// folder that already has `tasks/` (an existing vault, e.g. synced from
/// another Mac). Unreadable folders report false; `initialize_vault` rejects them.
pub fn has_unrelated_files(path: &Path) -> bool {
    if path.join("tasks").is_dir() {
        return false;
    }
    fs::read_dir(path).is_ok_and(|entries| {
        entries
            .flatten()
            .any(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
    })
}

/// The configured vault path *only if* the folder currently exists and is
/// readable; otherwise `None`. Used by `get_vault_path`.
pub fn resolve_existing_vault(app: &AppHandle) -> Option<String> {
    let path = read_config(app)?;
    if is_readable_dir(Path::new(&path)) {
        Some(path)
    } else {
        None
    }
}

/// The raw configured vault path, even if the folder is currently missing —
/// unlike `resolve_existing_vault`, this does not check readability. Lets the
/// frontend tell "never configured" (first run) apart from "configured but
/// unavailable" (e.g. an unmounted drive) so the gate screen can say which.
pub fn configured_vault_path(app: &AppHandle) -> Option<String> {
    read_config(app)
}

/// The configured vault path for use by data commands. Errors with `NoVault`
/// when nothing is configured or the folder is gone — commands should fail
/// loudly rather than silently operating on a missing vault.
pub fn require_vault(app: &AppHandle) -> AppResult<PathBuf> {
    match read_config(app) {
        Some(p) if is_readable_dir(Path::new(&p)) => Ok(PathBuf::from(p)),
        _ => Err(AppError::NoVault),
    }
}

/// Create the standard vault subfolders (idempotent).
pub fn ensure_subfolders(vault: &Path) -> AppResult<()> {
    for sub in SUBFOLDERS {
        fs::create_dir_all(vault.join(sub))?;
    }
    Ok(())
}

/// The subfolders `load_all` reads in full. Attachments are opened lazily.
const LOADED_SUBFOLDERS: [&str; 4] = ["tasks", "notes", "goals", "notebooks"];

/// Files in the loaded subfolders that iCloud Drive has evicted to the cloud
/// (`SF_DATALESS`). Reading one blocks until iCloud downloads it, about a
/// second each, so a synced vault on a fresh Mac would freeze the app for
/// minutes. `stat` doesn't trigger the download, so counting is instant.
#[cfg(target_os = "macos")]
fn dataless_files(vault: &Path) -> Vec<PathBuf> {
    use std::os::macos::fs::MetadataExt;
    const SF_DATALESS: u32 = 0x4000_0000;
    LOADED_SUBFOLDERS
        .iter()
        .flat_map(|sub| fs::read_dir(vault.join(sub)).into_iter().flatten().flatten())
        .filter(|entry| entry.metadata().is_ok_and(|m| m.st_flags() & SF_DATALESS != 0))
        .map(|entry| entry.path())
        .collect()
}

/// Ask iCloud Drive to download every evicted file the app is about to read,
/// then wait (bounded) until they're local. `brctl download` ships with macOS,
/// returns at once, and only works per file, not per folder (verified on
/// macOS 26). Errors with `CloudPending` if files remain after the deadline,
/// so the user gets a retry screen instead of a frozen window; downloads keep
/// going in the background meanwhile.
#[cfg(target_os = "macos")]
pub fn wait_for_cloud_files(vault: &Path) -> AppResult<()> {
    let pending = dataless_files(vault);
    if pending.is_empty() {
        return Ok(());
    }
    for file in &pending {
        let _ = std::process::Command::new("brctl")
            .arg("download")
            .arg(file)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
    // ponytail: fixed 60 s budget; make it a setting if big vaults on slow links need more.
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        std::thread::sleep(Duration::from_millis(500));
        let left = dataless_files(vault).len();
        if left == 0 {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(AppError::CloudPending(left));
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn wait_for_cloud_files(_vault: &Path) -> AppResult<()> {
    Ok(())
}

/// Initialize a folder as a vault: validate it's a readable directory, create
/// the standard subfolders, and persist it as the active vault.
pub fn initialize_vault(app: &AppHandle, vault: &Path) -> AppResult<String> {
    if !is_readable_dir(vault) {
        return Err(AppError::NotFound(format!(
            "vault folder is not a readable directory: {}",
            vault.display()
        )));
    }
    ensure_subfolders(vault)?;
    let path_str = vault.to_string_lossy().to_string();
    write_config(app, &path_str)?;
    Ok(path_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "notes-goals-vault-test-{}-{name}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn unrelated_files_ignores_empty_hidden_and_existing_vaults() {
        let empty = temp_dir("empty");
        assert!(!has_unrelated_files(&empty));

        let hidden = temp_dir("hidden");
        fs::write(hidden.join(".DS_Store"), "").unwrap();
        assert!(!has_unrelated_files(&hidden));

        let existing_vault = temp_dir("vault");
        ensure_subfolders(&existing_vault).unwrap();
        fs::write(existing_vault.join("README.md"), "").unwrap();
        assert!(!has_unrelated_files(&existing_vault));

        let documents = temp_dir("documents");
        fs::write(documents.join("taxes.pdf"), "").unwrap();
        assert!(has_unrelated_files(&documents));

        for dir in [empty, hidden, existing_vault, documents] {
            let _ = fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn local_files_never_wait_for_icloud() {
        let vault = temp_dir("local");
        ensure_subfolders(&vault).unwrap();
        fs::write(vault.join("tasks/t.json"), "{}").unwrap();
        let started = Instant::now();
        wait_for_cloud_files(&vault).unwrap();
        assert!(started.elapsed() < Duration::from_millis(400));
        let _ = fs::remove_dir_all(vault);
    }
}
