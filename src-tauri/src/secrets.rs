//! Keychain-backed secret storage (Dropbox refresh token). Values live in the
//! macOS login Keychain under one service; nothing is written to disk by us.

use keyring::Entry;

use crate::error::{AppError, AppResult};

const SERVICE: &str = "com.ashishjain.notesgoals";

/// Keys are `^[a-z0-9.-]{1,64}$`.
fn entry(key: &str) -> AppResult<Entry> {
    let ok = (1..=64).contains(&key.len())
        && key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-');
    if !ok {
        return Err(AppError::Secret(format!("invalid key: {key}")));
    }
    Entry::new(SERVICE, key).map_err(|e| AppError::Secret(e.to_string()))
}

fn secret(e: keyring::Error) -> AppError {
    AppError::Secret(e.to_string())
}

/// The stored secret, or `null` when none exists.
#[tauri::command]
pub async fn secret_get(key: String) -> AppResult<Option<String>> {
    run(move || match entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(secret(e)),
    })
    .await
}

#[tauri::command]
pub async fn secret_set(key: String, value: String) -> AppResult<()> {
    run(move || entry(&key)?.set_password(&value).map_err(secret)).await
}

/// Delete a secret; a missing one is fine.
#[tauri::command]
pub async fn secret_delete(key: String) -> AppResult<()> {
    run(move || match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(secret(e)),
    })
    .await
}

/// Keychain calls can block on a prompt, so keep them off the main thread.
async fn run<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Secret(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_validated() {
        assert!(entry("dropbox.refresh-token").is_ok());
        for bad in ["", "UPPER", "a b", "a/b", &"x".repeat(65)] {
            assert!(entry(bad).is_err(), "{bad:?}");
        }
    }
}
