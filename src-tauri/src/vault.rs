//! Vault location: the app stores only the *path* to the user's data folder,
//! nothing else outside it (CONTEXT.md). The path is persisted in
//! `<appConfigDir>/config.json` as `{ "vaultPath": "…" }` and resolved fresh on
//! every command — Rust holds no long-lived state (ADR-0006).

use std::fs;
use std::path::{Path, PathBuf};

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
