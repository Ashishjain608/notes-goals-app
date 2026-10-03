# Sync to the user's own Dropbox, and a phone app that reads it

Amends [ADR-0006](0006-rust-owns-io-frontend-holds-store.md) for the phone app only.

The user wants to use the app on their phone without handing their data to us. We host only static
code; the files live in the user's own storage. Dropbox comes first because a pure web page can sign
in to it (PKCE, refresh tokens, CORS on every endpoint we need, measured 2026-10-01). GitHub and
Google Drive are later options and are out of scope here.

## Decisions

**Sync is built in, through the Dropbox API, into an App Folder.** The Mac's data folder stays the
Mac's copy. Sync mirrors the same plain files to `Apps/<app name>/` in the user's Dropbox. The app
can see nothing else there. Users don't install the Dropbox desktop app. Pointing the data folder at
an iCloud or Dropbox folder keeps working as before.

**One sync engine, in TypeScript, for the Mac and the phone** (`src/sync/`). It works on files, not
entities: it compares each file's Dropbox `content_hash` on three sides (local, remote, and the last
state both agreed on, kept per device) and then uploads, downloads or deletes. On the Mac, Rust
still does all filesystem I/O. The engine reaches the data folder only through `sync_*` commands
that are confined to the vault and write only when the file is unchanged since the scan
(compare-and-swap). A delete arriving from Dropbox moves the file to `.atlas/trash/`, never unlinks
it (ADR-0003).

**Conflict rule: Dropbox's copy wins in place, and the losing local version is uploaded to
`.atlas/conflicts/`.** Entity filenames are ids, so a sibling "conflict copy" would load as a
duplicate entity. Putting the loser under `.atlas/` keeps it out of `load_all`, and no edit is ever
lost. A file that one side edited and the other deleted is kept (the edit wins).

**Mass-delete guard.** If one sync would delete more than 10 files and more than half of the files
synced so far, in either direction, it skips the deletes and asks the user to check. That is what
happens when a data folder is emptied or swapped by mistake.

**The phone app is the same React app, built for the web** and hosted as a PWA at
`qriousguy.com/notes-goals-app/app/`. `src/lib/ipc.ts` stays the only seam: in Tauri it calls Rust,
and in a browser it calls a TypeScript backend over a local copy of the files in IndexedDB. That
backend ports the file format and the domain rules from `store_io.rs` and `ops.rs`. **On the phone,
TypeScript generates ids and timestamps**, which is the part of ADR-0006 this amends. The Mac keeps
its Rust rules. Shared fixture files, written by each side and read by the other, keep the two
formats from drifting.

**What the phone syncs:** `tasks/`, `notes/`, `goals/` and `notebooks/`. It skips `attachments/` and
`.atlas/`. Attachments open on the phone through a temporary Dropbox link and can't be added there
yet.

**Tokens.** The Mac keeps the Dropbox refresh token in the macOS Keychain (Rust `secret_*`
commands). The phone keeps it in the browser's storage for that origin. Nobody but Dropbox and the
user's devices ever sees it. The Dropbox app key is public by design (PKCE has no client secret), so
it is checked into the source.

**Sign-in.** On the Mac the system browser opens Dropbox, which redirects to a one-shot loopback
listener at `http://localhost:53682/callback` run by Rust. On the phone a pop-up opened from the tap
redirects back to the app, and Dropbox's copy-the-code page is the fallback.

## Consequences

- Sync state (the last agreed hash and rev per file) is a per-device preference in `localStorage`,
  keyed by data folder. It is never written to the data folder, so two Macs sharing an iCloud
  folder each keep their own.
- The Mac's CSP `connect-src` allows `api.dropboxapi.com` and `content.dropboxapi.com`.
- Dropbox apps start in Development status (500 users). Production needs Dropbox's review once 50
  users have linked.
- A remote change to the note open in the editor reloads its metadata, but the editor keeps its
  in-memory body until the note is reopened.
