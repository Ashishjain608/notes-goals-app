//! Raw-bytes vault access for Dropbox sync (ADR-0011). The TypeScript sync
//! engine drives these commands; it decides *what* to sync, Rust only scans,
//! reads, and does compare-and-swap writes/deletes. Every command is `async`
//! and does its IO on a blocking thread so the window never freezes.

use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::oauth::percent_decode;
use crate::store_io::{write_replacing, VAULT_WRITE};
use crate::vault::{is_dataless, require_vault};

const BLOCK: usize = 4 * 1024 * 1024;

/// Dropbox's content hash: SHA-256 each 4 MiB block, SHA-256 the concatenated
/// digests, lowercase hex. Matches `src/sync/contentHash.ts`.
pub fn content_hash(bytes: &[u8]) -> String {
    let mut digests = Sha256::new();
    for block in bytes.chunks(BLOCK) {
        digests.update(Sha256::digest(block));
    }
    hex(&digests.finalize())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Join `rel` onto `vault`, refusing anything that could leave it: empty or
/// absolute paths, backslashes, and empty, `.` or `..` components.
pub fn resolve_vault_relative(vault: &Path, rel: &str) -> AppResult<PathBuf> {
    let bad = rel.is_empty()
        || rel.starts_with('/')
        || rel.contains('\\')
        || Path::new(rel).is_absolute()
        || rel.split('/').any(|c| c.is_empty() || c == "." || c == "..")
        || Path::new(rel).components().any(|c| !matches!(c, Component::Normal(_)));
    if bad {
        return Err(AppError::InvalidPath(rel.to_string()));
    }
    Ok(vault.join(rel))
}

/// One file in the vault, as the sync engine sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanEntry {
    pub path: String,
    pub size: u64,
    pub content_hash: String,
    /// In iCloud but not on this Mac (evicted). Sync must leave it alone: it is
    /// neither readable nor deleted.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub unavailable: bool,
}

/// Per-file hash cache keyed by absolute path; valid while size and mtime match.
#[derive(Default)]
pub struct HashCache(Mutex<HashMap<PathBuf, (u64, SystemTime, String)>>);

/// OS litter and half-written files never sync.
fn is_ignored(name: &str) -> bool {
    name.ends_with(".tmp")
        || name == ".DS_Store"
        || name == "Icon\r"
        || (name.starts_with('.') && name.ends_with(".icloud"))
}

/// Walk `dir`, appending an entry for every syncable file. Symlinks are skipped.
fn walk(vault: &Path, dir: &Path, cache: &HashCache, out: &mut Vec<ScanEntry>) -> AppResult<()> {
    for entry in fs::read_dir(dir)?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_ignored(&name) {
            continue;
        }
        let kind = entry.file_type()?;
        let path = entry.path();
        if kind.is_dir() {
            walk(vault, &path, cache, out)?;
        } else if kind.is_file() {
            let meta = entry.metadata()?;
            let rel = path.strip_prefix(vault).unwrap_or(&path);
            let rel = rel.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/");
            let unavailable = is_dataless(&meta);
            out.push(ScanEntry {
                path: rel,
                size: meta.len(),
                // Reading an evicted file would download it from iCloud; don't.
                content_hash: if unavailable { String::new() } else { cached_hash(cache, &path, &meta)? },
                unavailable,
            });
        }
    }
    Ok(())
}

fn cached_hash(cache: &HashCache, path: &Path, meta: &fs::Metadata) -> AppResult<String> {
    let (size, mtime) = (meta.len(), meta.modified()?);
    if let Some((s, m, h)) = cache.0.lock().unwrap().get(path) {
        if *s == size && *m == mtime {
            return Ok(h.clone());
        }
    }
    let hash = content_hash(&fs::read(path)?);
    cache.0.lock().unwrap().insert(path.to_path_buf(), (size, mtime, hash.clone()));
    Ok(hash)
}

fn scan(vault: &Path, cache: &HashCache) -> AppResult<Vec<ScanEntry>> {
    let mut out = Vec::new();
    walk(vault, vault, cache, &mut out)?;
    Ok(out)
}

/// Hash of the file as it is on disk right now (no cache); `None` if missing.
fn current_hash(path: &Path) -> AppResult<Option<String>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(content_hash(&bytes))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Does the file's current state match `expected` (empty = must not exist)?
fn matches_expected(path: &Path, expected: &str) -> AppResult<bool> {
    let current = current_hash(path)?;
    Ok(match (current, expected) {
        (None, "") => true,
        (Some(h), e) => h == e,
        (None, _) => false,
    })
}

fn write_cas(vault: &Path, rel: &str, expected: &str, bytes: &[u8]) -> AppResult<bool> {
    let path = resolve_vault_relative(vault, rel)?;
    let _guard = VAULT_WRITE.lock().unwrap_or_else(|e| e.into_inner());
    if !matches_expected(&path, expected)? {
        return Ok(false);
    }
    write_replacing(&path, bytes)?;
    Ok(true)
}

/// Move the file to `.atlas/trash/<rel>` (never unlink, ADR-0003) if its hash
/// still matches. A missing file or a hash mismatch returns `false`.
fn delete_cas(vault: &Path, rel: &str, expected: &str) -> AppResult<bool> {
    let path = resolve_vault_relative(vault, rel)?;
    let _guard = VAULT_WRITE.lock().unwrap_or_else(|e| e.into_inner());
    if expected.is_empty() || !path.is_file() || !matches_expected(&path, expected)? {
        return Ok(false);
    }
    let mut dest = vault.join(".atlas/trash").join(rel);
    if dest.exists() {
        let secs = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
        let mut name = dest.file_name().unwrap_or_default().to_os_string();
        name.push(format!(".{secs}"));
        dest.set_file_name(name);
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(&path, &dest)?;
    Ok(true)
}

fn header(request: &Request<'_>, name: &str) -> String {
    request.headers().get(name).and_then(|v| v.to_str().ok()).unwrap_or("").to_string()
}

async fn blocking<T, F>(f: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?
}

/// List every syncable file in the vault with its Dropbox content hash.
#[tauri::command]
pub async fn sync_scan(app: AppHandle) -> AppResult<Vec<ScanEntry>> {
    blocking(move || scan(&require_vault(&app)?, &app.state::<HashCache>())).await
}

/// Raw bytes of a vault file (an `ArrayBuffer` in JS).
#[tauri::command]
pub async fn sync_read_file(app: AppHandle, path: String) -> AppResult<Response> {
    blocking(move || {
        let full = resolve_vault_relative(&require_vault(&app)?, &path)?;
        match fs::read(full) {
            Ok(bytes) => Ok(Response::new(bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(AppError::NotFound(path)),
            Err(e) => Err(e.into()),
        }
    })
    .await
}

/// Compare-and-swap write. Body = raw file bytes; headers `x-path`
/// (`encodeURIComponent`) and `x-expected-hash` (empty = file must not exist).
#[tauri::command]
pub async fn sync_write_file(app: AppHandle, request: Request<'_>) -> AppResult<bool> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::InvalidPath("sync_write_file needs a raw body".into()));
    };
    let bytes = bytes.clone();
    let path = percent_decode(&header(&request, "x-path"), false);
    let expected = header(&request, "x-expected-hash");
    blocking(move || write_cas(&require_vault(&app)?, &path, &expected, &bytes)).await
}

/// Compare-and-swap delete: moves the file to `.atlas/trash/`.
#[tauri::command]
pub async fn sync_delete_file(app: AppHandle, path: String, expected_hash: String) -> AppResult<bool> {
    blocking(move || delete_cas(&require_vault(&app)?, &path, &expected_hash)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("notes-goals-sync-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn hash_of_empty_input_is_sha256_of_nothing() {
        assert_eq!(content_hash(b""), hex(&Sha256::digest(b"")));
    }

    #[test]
    fn hash_of_four_mib_plus_one_hashes_two_blocks() {
        let data = vec![7u8; BLOCK + 1];
        let mut joined = Vec::new();
        joined.extend_from_slice(&Sha256::digest(&data[..BLOCK]));
        joined.extend_from_slice(&Sha256::digest(&data[BLOCK..]));
        assert_eq!(content_hash(&data), hex(&Sha256::digest(&joined)));
    }

    #[test]
    fn path_guard_rejects_escapes() {
        let v = Path::new("/vault");
        for bad in ["", "/etc/passwd", "\\a", "a\\b", "../x", "a/../b", "a//b", "./a", "a/", "a/."] {
            assert!(resolve_vault_relative(v, bad).is_err(), "{bad:?}");
        }
        assert_eq!(resolve_vault_relative(v, "tasks/a b.json").unwrap(), v.join("tasks/a b.json"));
    }

    #[test]
    fn scan_skips_litter_and_caches() {
        let v = temp_vault("scan");
        fs::create_dir_all(v.join("tasks")).unwrap();
        fs::write(v.join("tasks/a.json"), "{}").unwrap();
        fs::write(v.join("tasks/a.json.tmp"), "x").unwrap();
        fs::write(v.join(".DS_Store"), "x").unwrap();
        fs::write(v.join("Icon\r"), "x").unwrap();
        fs::write(v.join(".b.json.icloud"), "x").unwrap();
        let cache = HashCache::default();
        let entries = scan(&v, &cache).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "tasks/a.json");
        assert_eq!(entries[0].content_hash, content_hash(b"{}"));
        assert_eq!(cache.0.lock().unwrap().len(), 1);
        let _ = fs::remove_dir_all(v);
    }

    #[test]
    fn write_is_compare_and_swap() {
        let v = temp_vault("write");
        assert!(write_cas(&v, "notes/n.md", "", b"one").unwrap());
        assert!(!write_cas(&v, "notes/n.md", "", b"two").unwrap());
        assert!(!write_cas(&v, "notes/n.md", "bogus", b"two").unwrap());
        assert!(write_cas(&v, "notes/n.md", &content_hash(b"one"), b"two").unwrap());
        assert_eq!(fs::read(v.join("notes/n.md")).unwrap(), b"two");
        assert!(write_cas(&v, "../escape", "", b"x").is_err());
        let _ = fs::remove_dir_all(v);
    }

    #[test]
    fn delete_moves_to_trash_and_keeps_collisions() {
        let v = temp_vault("delete");
        write_cas(&v, "tasks/t.json", "", b"a").unwrap();
        assert!(!delete_cas(&v, "tasks/t.json", "bogus").unwrap());
        assert!(delete_cas(&v, "tasks/t.json", &content_hash(b"a")).unwrap());
        assert!(!v.join("tasks/t.json").exists());
        assert_eq!(fs::read(v.join(".atlas/trash/tasks/t.json")).unwrap(), b"a");
        write_cas(&v, "tasks/t.json", "", b"b").unwrap();
        assert!(delete_cas(&v, "tasks/t.json", &content_hash(b"b")).unwrap());
        assert_eq!(fs::read_dir(v.join(".atlas/trash/tasks")).unwrap().count(), 2);
        assert!(!delete_cas(&v, "tasks/t.json", &content_hash(b"b")).unwrap());
        let _ = fs::remove_dir_all(v);
    }
}
