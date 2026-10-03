//! Notes & Goals — Tauri backend.
//!
//! Rust owns all filesystem I/O for the user's data folder (the "vault"); the
//! frontend holds the working in-memory store and talks to this crate only
//! through the typed commands below (docs/adr/0006). Disk is the source of
//! truth; Rust is a stateless serializer that resolves the vault path from
//! `config.json` on every call.
//!
//! Module map:
//! - `error` — the `AppError` returned by every command.
//! - `model` — serde structs mirroring `src/types.ts`.
//! - `vault` — vault config (`config.json`) + path resolution.
//! - `store_io` — parse/serialize, atomic writes, trash, `load_all` helpers.
//! - `ops` — vault-touching domain logic, `fn(vault: &Path, ...)` (no
//!   `AppHandle`), called by `commands`.
//! - `sync_fs` — raw-bytes vault access for Dropbox sync (scan, CAS write/delete).
//! - `secrets` — Keychain-backed secret storage.
//! - `oauth` — one-shot loopback listener for the OAuth redirect.
//! - `commands` — the `#[tauri::command]` surface registered below; each is a
//!   thin adapter that resolves the vault and calls `ops`.

mod commands;
mod error;
mod model;
mod oauth;
mod ops;
mod secrets;
mod store_io;
mod sync_fs;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(sync_fs::HashCache::default())
        .manage(oauth::OAuthGeneration::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_vault_path,
            commands::get_configured_vault_path,
            commands::choose_vault,
            commands::relocate_vault,
            commands::load_all,
            commands::load_note_body,
            commands::search_note_bodies,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::create_note,
            commands::update_note,
            commands::delete_note,
            commands::move_note,
            commands::create_notebook,
            commands::update_notebook,
            commands::delete_notebook,
            commands::create_goal,
            commands::update_goal,
            commands::delete_goal,
            commands::attach_files,
            commands::attach_bytes,
            commands::remove_attachment,
            commands::open_attachment,
            sync_fs::sync_scan,
            sync_fs::sync_read_file,
            sync_fs::sync_write_file,
            sync_fs::sync_delete_file,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            oauth::oauth_wait_for_code,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
