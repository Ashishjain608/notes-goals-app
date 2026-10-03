/**
 * The phone's local copy of the data folder (docs/adr/0011): files in
 * IndexedDB, or in memory for tests. Both satisfy VaultFiles (compare-and-swap
 * writes/removes, src/sync/types.ts) plus text helpers for the web backend.
 * Records are keyed by lowercase path (Dropbox and APFS are case-insensitive).
 */

import { contentHash } from "@/sync/contentHash";
import type { LocalEntry, VaultFiles } from "@/sync/types";

/** VaultFiles plus the plain-text conveniences web.ts needs. */
export interface VaultTextFiles extends VaultFiles {
  readText(path: string): Promise<string | null>;
  /** Unconditional write (not CAS): last writer wins, like Rust's atomic_write. */
  writeText(path: string, text: string): Promise<void>;
  /** Unconditional delete; false if the file did not exist. */
  removeFile(path: string): Promise<boolean>;
  /** Vault-relative paths starting with `prefix` (e.g. "tasks/"). */
  listDir(prefix: string): Promise<string[]>;
}

interface FileRecord {
  key: string;
  path: string;
  bytes: Uint8Array;
  size: number;
  contentHash: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function makeRecord(path: string, bytes: Uint8Array): Promise<FileRecord> {
  return { key: path.toLowerCase(), path, bytes, size: bytes.length, contentHash: await contentHash(bytes) };
}

const toEntry = (r: FileRecord): LocalEntry => ({ path: r.path, size: r.size, contentHash: r.contentHash });

/** Layer the text helpers over any VaultFiles; unconditional ops retry around the CAS. */
function withText(files: VaultFiles): VaultTextFiles {
  const currentHash = async (path: string) => {
    const bytes = await files.read(path);
    return bytes ? contentHash(bytes) : null;
  };
  return {
    ...files,
    async readText(path) {
      const bytes = await files.read(path);
      return bytes ? dec.decode(bytes) : null;
    },
    async writeText(path, text) {
      const bytes = enc.encode(text);
      while (!(await files.write(path, bytes, await currentHash(path)))) {
        // changed between reading its hash and writing: try again
      }
    },
    async removeFile(path) {
      for (;;) {
        const hash = await currentHash(path);
        if (hash === null) return false;
        if (await files.remove(path, hash)) return true;
      }
    },
    async listDir(prefix) {
      const p = prefix.toLowerCase();
      return (await files.list()).map((e) => e.path).filter((x) => x.toLowerCase().startsWith(p));
    },
  };
}

/* ---------------------------------------------------------------- in memory */

/** In-memory files with the same semantics as the IndexedDB ones. */
export function createMemoryFiles(): VaultTextFiles {
  const map = new Map<string, FileRecord>();
  // The CAS check and the set run synchronously after the (async) hash, so they are atomic.
  return withText({
    async list() {
      return [...map.values()].map(toEntry);
    },
    async read(path) {
      const r = map.get(path.toLowerCase());
      return r ? r.bytes.slice() : null;
    },
    async write(path, bytes, expectedHash) {
      const rec = await makeRecord(path, bytes.slice());
      if ((map.get(rec.key)?.contentHash ?? null) !== expectedHash) return false;
      map.set(rec.key, rec);
      return true;
    },
    async remove(path, expectedHash) {
      const key = path.toLowerCase();
      if (map.get(key)?.contentHash !== expectedHash) return false;
      map.delete(key);
      return true;
    },
  });
}

/* ---------------------------------------------------------------- IndexedDB */

const STORE = "files";

const done = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

function openDb(name: string): Promise<IDBDatabase> {
  const req = indexedDB.open(name, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
  return done(req);
}

/** Files in IndexedDB database `dbName`. Hashes are computed before a transaction opens (it would auto-commit across other awaits). */
export function createIdbFiles(dbName = "notes-goals-vault"): VaultTextFiles {
  let db: Promise<IDBDatabase> | null = null;
  const store = async (mode: IDBTransactionMode) => {
    const tx = (await (db ??= openDb(dbName))).transaction(STORE, mode);
    return { tx, os: tx.objectStore(STORE) };
  };

  return withText({
    async list() {
      const { os } = await store("readonly");
      return ((await done(os.getAll())) as FileRecord[]).map(toEntry);
    },
    async read(path) {
      const { os } = await store("readonly");
      const r = (await done(os.get(path.toLowerCase()))) as FileRecord | undefined;
      return r ? r.bytes.slice() : null;
    },
    async write(path, bytes, expectedHash) {
      const rec = await makeRecord(path, bytes.slice());
      const { tx, os } = await store("readwrite");
      const current = (await done(os.get(rec.key))) as FileRecord | undefined;
      if ((current?.contentHash ?? null) !== expectedHash) return false;
      os.put(rec);
      await txDone(tx);
      return true;
    },
    async remove(path, expectedHash) {
      const { tx, os } = await store("readwrite");
      const key = path.toLowerCase();
      const current = (await done(os.get(key))) as FileRecord | undefined;
      if (current?.contentHash !== expectedHash) return false;
      os.delete(key);
      await txDone(tx);
      return true;
    },
  });
}
