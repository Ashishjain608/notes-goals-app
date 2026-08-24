//! Application error type shared by every Tauri command.
//!
//! Tauri requires a command's error type to be `Serialize` so it can be sent
//! across the IPC boundary and rejected as a JS `Promise`. We serialize the
//! error as its human-readable `Display` string (a plain JSON string), which is
//! all the frontend needs to surface a message.

use serde::{Serialize, Serializer};

/// Every failure mode a command can return.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// Wraps any `std::io` failure (read, write, rename, create_dir, …).
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON (de)serialization failed for a task or goal file.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// YAML (de)serialization failed for a note's frontmatter.
    #[error("YAML error: {0}")]
    Yaml(#[from] serde_yaml::Error),

    /// No vault folder has been configured yet (or its config is unreadable).
    #[error("no vault configured")]
    NoVault,

    /// An entity (or its backing file) could not be found.
    #[error("not found: {0}")]
    NotFound(String),

    /// A note file is missing or malformed frontmatter delimiters.
    #[error("invalid note format: {0}")]
    InvalidNote(String),

    /// An attachment path failed the path-traversal trust-boundary check —
    /// not a plain `attachments/<id>/<name>` path inside the vault.
    #[error("invalid attachment path: {0}")]
    InvalidAttachmentPath(String),
}

/// Convenience alias for command results.
pub type AppResult<T> = Result<T, AppError>;

impl Serialize for AppError {
    /// Serialize the error as its `Display` string so the frontend receives a
    /// plain, readable message rather than a structured enum.
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
