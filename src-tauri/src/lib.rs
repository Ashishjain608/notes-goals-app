//! Notes & Goals — Tauri backend.
//!
//! Wave-1 scaffold. The storage layer (model.rs, store_io.rs) and the full
//! command surface (commands.rs) are implemented by the Rust spine agent, which
//! owns this entire crate. Keep all filesystem I/O here (docs/adr/0006).

#[tauri::command]
fn ping() -> String {
    "pong".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
