//! Notes & Goals — Tauri backend.
//!
//! Rust owns all filesystem I/O for the user's data folder (the "vault"); the
//! frontend holds the working in-memory store and talks to this crate only
//! through the typed commands below (docs/adr/0006). Disk is the source of
//! truth; Rust is a stateless serializer that resolves the vault path from
//! `config.json` on every call.
//!
//! Module map:
//! - `error`    — the `AppError` returned by every command.
//! - `model`    — serde structs mirroring `src/types.ts`.
//! - `vault`    — vault config (`config.json`) + path resolution.
//! - `store_io` — parse/serialize, atomic writes, trash, `load_all` helpers.
//! - `commands` — the `#[tauri::command]` surface registered below.

mod commands;
mod error;
mod model;
mod store_io;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_vault_path,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
