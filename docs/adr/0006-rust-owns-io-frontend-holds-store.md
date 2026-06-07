# Rust owns all filesystem I/O; the frontend holds the working store; disk is the source of truth

The build brief was internally ambiguous (route writes through Rust, but "you may use the fs plugin for reads"; "the index is owned in one place," but also an in-memory store that makes views instant). We resolve it as:

- **Rust owns *all* filesystem I/O** — both reads and writes. A single `load_all()` command reads `tasks/`, `notes/`, `goals/`, parses each file, resolves `goalId` links, and applies the dangling-link rule (ADR-0003), returning one typed entity graph. Write/delete go through `save_task` / `save_note` / `save_goal` / `delete_entity` / `pick_vault`. This keeps all parsing, validation, and atomic-write logic in one place rather than scattered into JS.
- **The frontend (Zustand) holds the authoritative *working* in-memory copy.** Every view is a pure selector over that store; mutations update the store and call the matching Rust save command. Rust is a **stateless serializer** — it does not keep a second long-lived in-memory index, avoiding two-copy sync problems.
- **Disk is the source of truth.** The in-memory store is a working copy rehydrated from disk via `load_all()`.
- **Rust generates `id` (UUID v4), `created`, and `completed`** inside its commands and returns the persisted entity; the frontend never fabricates identity or clock values.
- **Filenames are `<uuid>.json` / `<uuid>.md` and are never renamed** when titles change — title is content, filename is identity.

## Consequences

- All writes are atomic (write `<file>.tmp`, fsync, rename) inside Rust.
- Awaiting a local FS write is sub-millisecond, so the UI uses await-then-update — no optimistic-UI machinery needed.
- A future Rust file-watcher (ADR-0003 / fast-follow) is the one place that may hold light state to detect external edits and signal the frontend to re-`load_all()`.
