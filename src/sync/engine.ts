/**
 * The sync engine (docs/adr/0011): a pure planner plus an executor. Three-way
 * comparison of local, remote and the base (what both sides last agreed on),
 * all by content hash, keyed by lowercase path.
 */
import {
  RemoteConflictError,
  type BaseEntry,
  type LocalEntry,
  type Remote,
  type RemoteEntry,
  type StateStore,
  type SyncResult,
  type VaultFiles,
} from "./types";

export type Action =
  | { kind: "record"; key: string; entry: BaseEntry }
  | { kind: "dropBase"; key: string }
  | { kind: "upload"; path: string; rev: string | null }
  | { kind: "download"; path: string; expectedHash: string | null }
  | { kind: "deleteRemote"; path: string; rev: string }
  | { kind: "deleteLocal"; path: string; expectedHash: string }
  /** Keep the local bytes as a copy on the remote, then take the remote version. */
  | { kind: "conflict"; path: string; copyPath: string; expectedHash: string }
  /** A delete the mass-delete guard held back; never executed. */
  | { kind: "held" };

export interface PlanOptions {
  deviceName?: string;
  now?: Date;
}

const GUARD_MIN = 10;

/** `.atlas/conflicts/<dir>/<name>.<device>-<UTC stamp>.<ext>` for a conflicted path. */
export function conflictPath(path: string, deviceName: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const device = deviceName.replace(/[^A-Za-z0-9_-]/g, "-");
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf(".");
  const [name, ext] = dot > 0 ? [file.slice(0, dot), file.slice(dot)] : [file, ""];
  return `.atlas/conflicts/${dir}${name}.${device}-${stamp}${ext}`;
}

function byKey<T extends { path: string }>(items: T[], include: (p: string) => boolean): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) if (include(item.path)) map.set(item.path.toLowerCase(), item);
  return map;
}

/** Decide what to do for one path. Returns null when nothing is needed. */
function decide(
  key: string,
  l: LocalEntry | undefined,
  r: RemoteEntry | undefined,
  b: BaseEntry | undefined,
  conflictCopy: (path: string) => string,
): Action | null {
  if (l && r) {
    if (l.contentHash === r.contentHash) {
      const same = b && b.contentHash === r.contentHash && b.rev === r.rev;
      return same ? null : { kind: "record", key, entry: { path: r.path, contentHash: r.contentHash, rev: r.rev } };
    }
    if (b && l.contentHash === b.contentHash) return { kind: "download", path: r.path, expectedHash: l.contentHash };
    if (b && r.contentHash === b.contentHash) return { kind: "upload", path: l.path, rev: b.rev };
    return { kind: "conflict", path: l.path, copyPath: conflictCopy(l.path), expectedHash: l.contentHash };
  }
  if (l) {
    if (!b) return { kind: "upload", path: l.path, rev: null };
    if (l.contentHash === b.contentHash) return { kind: "deleteLocal", path: l.path, expectedHash: l.contentHash };
    return { kind: "upload", path: l.path, rev: null }; // edit beats delete
  }
  if (r) {
    if (!b) return { kind: "download", path: r.path, expectedHash: null };
    if (r.contentHash === b.contentHash) return { kind: "deleteRemote", path: r.path, rev: b.rev };
    return { kind: "download", path: r.path, expectedHash: null }; // edit beats delete
  }
  return b ? { kind: "dropBase", key } : null;
}

/** Hold back a delete kind when it would remove > 10 files and > 50% of the base. */
function guard(actions: Action[], kind: "deleteLocal" | "deleteRemote", baseCount: number): Action[] {
  const n = actions.filter((a) => a.kind === kind).length;
  if (n <= GUARD_MIN || n * 2 <= baseCount) return actions;
  return actions.map((a): Action => (a.kind === kind ? { kind: "held" } : a));
}

/** Pure: compare both sides against the base and list what to do. */
export function plan(
  local: LocalEntry[],
  remote: RemoteEntry[],
  base: Record<string, BaseEntry>,
  include: (path: string) => boolean,
  opts: PlanOptions = {},
): Action[] {
  const locals = byKey(local, include);
  const remotes = byKey(remote, include);
  const now = opts.now ?? new Date();
  const copy = (p: string) => conflictPath(p, opts.deviceName ?? "device", now);
  const keys = new Set([...locals.keys(), ...remotes.keys()]);
  for (const [key, b] of Object.entries(base)) if (include(b.path)) keys.add(key);

  let actions: Action[] = [];
  for (const key of keys) {
    const a = decide(key, locals.get(key), remotes.get(key), base[key], copy);
    if (a) actions.push(a);
  }
  const baseCount = Object.keys(base).length;
  actions = guard(actions, "deleteLocal", baseCount);
  return guard(actions, "deleteRemote", baseCount);
}

export interface SyncDeps {
  files: VaultFiles;
  remote: Remote;
  state: StateStore;
  include: (path: string) => boolean;
  deviceName: string;
  now?: () => Date;
  onProgress?: (done: number, total: number) => void;
}

const CONCURRENCY = 4;
const SAVE_EVERY = 50;

/**
 * One sync cycle. The caller guarantees no two runs overlap (the engine takes
 * no lock). A lost compare-and-swap or a stale rev skips that file; the next
 * cycle resolves it. AuthLostError and network errors propagate; progress made
 * so far is still saved.
 */
export async function syncOnce(deps: SyncDeps): Promise<SyncResult> {
  const { files, remote, state: store } = deps;
  const state = await store.load();
  const [local, remoteList] = await Promise.all([files.list(), remote.listAll()]);
  const all = plan(local, remoteList, state.files, deps.include, {
    deviceName: deps.deviceName,
    now: (deps.now ?? (() => new Date()))(),
  });

  const result: SyncResult = {
    uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, conflicts: 0, heldDeletes: 0,
  };
  const work: Action[] = [];
  for (const a of all) {
    if (a.kind === "record") state.files[a.key] = a.entry;
    else if (a.kind === "dropBase") delete state.files[a.key];
    else if (a.kind === "held") result.heldDeletes++;
    else work.push(a);
  }

  const setBase = (e: RemoteEntry) => {
    state.files[e.path.toLowerCase()] = { path: e.path, contentHash: e.contentHash, rev: e.rev };
  };
  const download = async (path: string, expectedHash: string | null): Promise<boolean> => {
    const { bytes, entry } = await remote.download(path);
    if (!(await files.write(path, bytes, expectedHash))) return false;
    setBase(entry);
    return true;
  };

  const run = async (a: Action): Promise<void> => {
    try {
      switch (a.kind) {
        case "upload": {
          const bytes = await files.read(a.path);
          if (!bytes) return;
          setBase(await remote.upload(a.path, bytes, a.rev));
          result.uploaded++;
          return;
        }
        case "download":
          if (await download(a.path, a.expectedHash)) result.downloaded++;
          return;
        case "deleteRemote":
          await remote.remove(a.path, a.rev);
          delete state.files[a.path.toLowerCase()];
          result.deletedRemote++;
          return;
        case "deleteLocal":
          if (await files.remove(a.path, a.expectedHash)) {
            delete state.files[a.path.toLowerCase()];
            result.deletedLocal++;
          }
          return;
        case "conflict": {
          const bytes = await files.read(a.path);
          if (!bytes) return;
          await remote.upload(a.copyPath, bytes, "overwrite");
          if (await download(a.path, a.expectedHash)) result.conflicts++;
          return;
        }
      }
    } catch (e) {
      if (e instanceof RemoteConflictError) return;
      throw e;
    }
  };

  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < work.length) {
      await run(work[next++]!);
      done++;
      deps.onProgress?.(done, work.length);
      if (done % SAVE_EVERY === 0) await store.save(state);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));
  } finally {
    await store.save(state);
  }
  return result;
}

