/**
 * Contracts for sync (docs/adr/0011). The engine (engine.ts) works on files,
 * not entities: every path here is vault-relative POSIX, no leading slash,
 * e.g. "tasks/<uuid>.json". Hashes are Dropbox content hashes (lowercase hex,
 * see contentHash.ts) so local and remote files compare without downloading.
 */

/** A file in the local copy of the data folder. */
export interface LocalEntry {
  path: string;
  size: number;
  contentHash: string;
}

/**
 * The local copy the engine reads and writes. Mac: the data folder through
 * Rust `sync_*` commands. Phone: IndexedDB. Writes and removes are
 * compare-and-swap so a save landing mid-sync is never overwritten.
 */
export interface VaultFiles {
  list(): Promise<LocalEntry[]>;
  /** Null when the file does not exist. */
  read(path: string): Promise<Uint8Array | null>;
  /**
   * Write only if the file's current hash equals `expectedHash` (null = the
   * file must not exist). Returns false, writing nothing, if it changed.
   */
  write(path: string, bytes: Uint8Array, expectedHash: string | null): Promise<boolean>;
  /** Delete (Mac: move to .atlas/trash/) only if the hash still matches. */
  remove(path: string, expectedHash: string): Promise<boolean>;
}

/** A file in the Dropbox App Folder. `path` is path_display minus the leading "/". */
export interface RemoteEntry {
  path: string;
  rev: string;
  size: number;
  contentHash: string;
}

/** Thrown by Remote.upload when `rev` no longer matches (Dropbox 409 conflict). */
export class RemoteConflictError extends Error {
  constructor(public readonly path: string) {
    super(`Dropbox has a newer version of ${path}`);
    this.name = "RemoteConflictError";
  }
}

/** Thrown when the refresh token is revoked or invalid: the user must reconnect. */
export class AuthLostError extends Error {
  constructor() {
    super("Dropbox access was revoked. Connect again in Settings.");
    this.name = "AuthLostError";
  }
}

/** The Dropbox App Folder, as the engine needs it. Implemented by DropboxClient. */
export interface Remote {
  /** Every file in the App Folder (recursive). */
  listAll(): Promise<RemoteEntry[]>;
  download(path: string): Promise<{ bytes: Uint8Array; entry: RemoteEntry }>;
  /**
   * Every file under top-level `folder` in one request, keyed by lowercase path,
   * each with its content hash. Optional: without it every file is fetched alone.
   */
  downloadFolder?(folder: string): Promise<Map<string, { bytes: Uint8Array; contentHash: string }>>;
  /**
   * `rev` = the rev we last saw (update mode, throws RemoteConflictError when
   * stale); null = add mode (the file must not exist yet); "overwrite" = no check.
   */
  upload(path: string, bytes: Uint8Array, rev: string | null | "overwrite"): Promise<RemoteEntry>;
  /** Delete, failing with RemoteConflictError if `rev` is stale. A missing file is fine. */
  remove(path: string, rev: string): Promise<void>;
}

/** What both sides last agreed a file was. */
export interface BaseEntry {
  path: string;
  contentHash: string;
  rev: string;
}

/** Per-device sync record, keyed by lowercase path (Dropbox and APFS are case-insensitive). */
export interface SyncState {
  files: Record<string, BaseEntry>;
}

/** Persists SyncState. Both platforms: localStorage keyed by data folder. */
export interface StateStore {
  load(): Promise<SyncState>;
  save(state: SyncState): Promise<void>;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  deletedLocal: number;
  deletedRemote: number;
  conflicts: number;
  /** Deletes held back by the mass-delete guard (ADR-0011). 0 normally. */
  heldDeletes: number;
}

export type SyncPhase =
  | "off" //        not connected
  | "idle" //       connected, last sync fine
  | "syncing"
  | "offline" //    network unreachable; retries on its own
  | "attention" //  needs the user: mass-delete guard tripped, or access revoked
  | "error";

export interface SyncStatus {
  phase: SyncPhase;
  account: { name: string; email: string } | null;
  /** ISO-8601 UTC of the last sync that finished cleanly. */
  lastSyncedAt: string | null;
  /** Plain-language line for the UI when phase is offline/attention/error. */
  message: string | null;
  /** While syncing: files done of total, and when the transfer began (epoch ms). */
  progress?: { done: number; total: number; startedAt: number } | null;
  /** The last sync that moved files: how many, and how long it took. */
  lastRun?: { files: number; ms: number } | null;
}
