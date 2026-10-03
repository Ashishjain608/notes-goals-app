/**
 * The sync controller (docs/adr/0011): one module-level object that owns the
 * Dropbox connection, the scheduler and the status the UI shows. The store and
 * views talk to it; it never imports the store (the store registers `hooks`).
 *
 * Mac: files through the Rust `sync_*` commands, token in the Keychain,
 * sign-in through a one-shot loopback listener. Phone: files in IndexedDB,
 * token in localStorage, sign-in in a pop-up that posts the code back.
 */
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@/lib/platform";
import { setWebAttachmentOpener, webFiles } from "@/lib/backend/web";
import { DROPBOX_APP_KEY, LOOPBACK_PORT, MAC_INCLUDE, MAC_REDIRECT_URI, PHONE_INCLUDE, webRedirectUri } from "./config";
import { authorizeUrl, createPkce, DropboxClient, exchangeCode } from "./dropbox";
import { syncOnce } from "./engine";
import { createScheduler, type Scheduler, type StatusPatch } from "./scheduler";
import type { LocalEntry, StateStore, SyncResult, SyncState, SyncStatus, VaultFiles } from "./types";

/* ---------------------------------------------------------------- storage */

const ls = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* storage blocked: sync still works this session */ }
  },
  del(key: string): void {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

const K_RECORD = "ng-sync-dropbox";
const K_PHONE_TOKEN = "ng-dropbox-refresh";
const K_PKCE = "ng-dropbox-pkce";
const K_DEVICE = "ng-sync-device";
const KEYCHAIN_KEY = "dropbox.refresh";

const stateKey = (vaultKey: string) => `ng-sync-state:${vaultKey}`;

/* ------------------------------------------------------------ adapters */

const missing = (e: unknown) => String((e as { message?: string })?.message ?? e).startsWith("not found");

const macFiles: VaultFiles = {
  list: () => invoke<LocalEntry[]>("sync_scan"),
  async read(path) {
    try {
      return new Uint8Array(await invoke<ArrayBuffer>("sync_read_file", { path }));
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  },
  write: (path, bytes, expected) =>
    invoke<boolean>("sync_write_file", bytes, {
      headers: { "x-path": encodeURIComponent(path), "x-expected-hash": expected ?? "" },
    }),
  remove: (path, expectedHash) => invoke<boolean>("sync_delete_file", { path, expectedHash }),
};

const tokenStore = {
  get: (): Promise<string | null> =>
    isTauri ? invoke<string | null>("secret_get", { key: KEYCHAIN_KEY }) : Promise.resolve(ls.get(K_PHONE_TOKEN)),
  async set(value: string): Promise<void> {
    if (isTauri) await invoke("secret_set", { key: KEYCHAIN_KEY, value });
    else ls.set(K_PHONE_TOKEN, value);
  },
  async del(): Promise<void> {
    if (isTauri) await invoke("secret_delete", { key: KEYCHAIN_KEY });
    else ls.del(K_PHONE_TOKEN);
  },
};

function deviceName(): string {
  let id = ls.get(K_DEVICE);
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => b.toString(16).padStart(2, "0")).join("");
    ls.set(K_DEVICE, id);
  }
  return `${isTauri ? "mac" : "phone"}-${id}`;
}

function stateStoreFor(vaultKey: string): StateStore {
  return {
    async load(): Promise<SyncState> {
      try {
        const parsed = JSON.parse(ls.get(stateKey(vaultKey)) ?? "null") as SyncState | null;
        return parsed?.files ? parsed : { files: {} };
      } catch {
        return { files: {} };
      }
    },
    async save(state) {
      ls.set(stateKey(vaultKey), JSON.stringify(state));
    },
  };
}

/* ------------------------------------------------------------- controller */

type Account = { name: string; email: string };
type Pkce = { verifier: string; challenge: string; state: string };
type Hooks = { reload: () => Promise<void>; savePending: () => boolean };

const OFF: SyncStatus = { phase: "off", account: null, lastSyncedAt: null, message: null };
const randomState = () => crypto.randomUUID();

let status: SyncStatus = OFF;
const listeners = new Set<(s: SyncStatus) => void>();
let hooks: Hooks = { reload: async () => {}, savePending: () => false };
let vaultKey: string | null = null;
let client: DropboxClient | null = null;
let scheduler: Scheduler | null = null;
let prepared: Pkce | null = null;
let cancelWait: (() => void) | null = null;
let detachEvents: (() => void) | null = null;

function publish(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

const readRecord = (): { account: Account } | null => {
  try {
    const r = JSON.parse(ls.get(K_RECORD) ?? "null") as { account?: Account } | null;
    return r?.account ? { account: r.account } : null;
  } catch {
    return null;
  }
};

const newClient = () =>
  (client = new DropboxClient({ appKey: DROPBOX_APP_KEY, getRefreshToken: () => tokenStore.get() }));

function files(): VaultFiles {
  return isTauri ? macFiles : webFiles();
}

function runOnce(onProgress?: (done: number, total: number) => void): Promise<SyncResult> {
  return syncOnce({
    files: files(),
    remote: client ?? newClient(),
    state: stateStoreFor(vaultKey ?? (isTauri ? "" : "dropbox")),
    include: isTauri ? MAC_INCLUDE : PHONE_INCLUDE,
    deviceName: deviceName(),
    onProgress,
  });
}

function stopScheduling(): void {
  scheduler?.stop();
  detachEvents?.();
  scheduler = detachEvents = null;
}

function startScheduling(): void {
  if (scheduler) {
    // Still here after a revoke stopped its heartbeat: re-arm it and sync now.
    scheduler.start();
    void scheduler.runNow();
    return;
  }
  scheduler = createScheduler({
    run: (onProgress) => runOnce(onProgress),
    setStatus: (p: StatusPatch) => publish(p),
    reload: () => hooks.reload(),
    savePending: () => hooks.savePending(),
    isOnline: () => navigator.onLine !== false,
  });
  scheduler.start();
  const ask = () => scheduler?.request();
  const visible = () => document.visibilityState === "visible" && ask();
  window.addEventListener("focus", ask);
  window.addEventListener("online", ask);
  document.addEventListener("visibilitychange", visible);
  detachEvents = () => {
    window.removeEventListener("focus", ask);
    window.removeEventListener("online", ask);
    document.removeEventListener("visibilitychange", visible);
  };
  ask();
}

/** Save the token and who it belongs to; the account lookup proves the token works. */
async function finishConnect(refreshToken: string): Promise<void> {
  await tokenStore.set(refreshToken);
  const account = await newClient().account();
  ls.set(K_RECORD, JSON.stringify({ account }));
  publish({ phase: "idle", account, message: null });
}

async function trade(code: string, p: { verifier: string; redirectUri?: string }): Promise<void> {
  const t = await exchangeCode({ appKey: DROPBOX_APP_KEY, code, verifier: p.verifier, redirectUri: p.redirectUri });
  if (!t.refreshToken) throw new Error("Dropbox didn't return a long-lived sign-in. Try connecting again.");
  await finishConnect(t.refreshToken);
}

/* ------------------------------------------------------- phone sign-in */

const PRIVATE_CHANNEL = "ng-dropbox-auth";
const POPUP_NAME = "dropbox-auth";
/** What the pop-up posts back: a code, or Dropbox's `error` (e.g. access_denied when the user cancels). */
type CodeMessage = { type: "dropbox-code"; code: string; state: string; error?: string };

function readStash(): (Pkce & { mode: "popup" | "code" }) | null {
  try {
    return JSON.parse(ls.get(K_PKCE) ?? "null");
  } catch {
    return null;
  }
}

/** Resolves with the code the pop-up posts back (postMessage or BroadcastChannel), checking origin and state. */
function waitForPopupCode(state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(PRIVATE_CHANNEL) : null;
    const timeout = setTimeout(() => done(() => reject(new Error("Sign-in timed out."))), 300_000);
    const accept = (m: CodeMessage | null | undefined) => {
      if (m?.type !== "dropbox-code" || m.state !== state) return;
      if (m.error) done(() => reject(new Error(m.error === "access_denied" ? "cancelled" : `Dropbox said: ${m.error}`)));
      else done(() => resolve(m.code));
    };
    const onMessage = (e: MessageEvent) => e.origin === location.origin && accept(e.data as CodeMessage);
    const onChannel = (e: MessageEvent) => accept(e.data as CodeMessage);
    function done(finish: () => void) {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      channel?.close();
      cancelWait = null;
      finish();
    }
    window.addEventListener("message", onMessage);
    channel?.addEventListener("message", onChannel);
    cancelWait = () => done(() => reject(new Error("cancelled")));
  });
}

/* --------------------------------------------------------------- public */

let pendingRedirect: { code: string; state: string; error?: string } | null = null;

export const syncController = {
  getStatus: (): SyncStatus => status,
  subscribe(fn: (s: SyncStatus) => void): () => void {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  /** The store registers how to reload and whether a save is in flight. */
  setHooks(h: Hooks): void {
    hooks = h;
  },

  /** Call once the app is ready. Safe to repeat; a different vaultKey (Mac folder switch) restarts. */
  start(key: string): void {
    if (vaultKey !== key) stopScheduling();
    vaultKey = key;
    const record = readRecord();
    if (!record) return publish({ ...OFF });
    publish({ account: record.account, phase: status.phase === "off" ? "idle" : status.phase });
    startScheduling();
  },

  /** Sync soon (debounced). No-op when not connected. Called after every save. */
  requestSync(): void {
    scheduler?.request();
  },
  async syncNow(): Promise<void> {
    if (!scheduler) startScheduling();
    await scheduler?.runNow();
  },

  /**
   * First sync during phone onboarding, with progress. Errors propagate so the
   * screen can show them and retry; the connection stays.
   */
  async firstSync(onProgress: (done: number, total: number) => void): Promise<void> {
    const began = Date.now();
    let files = 0;
    await runOnce((done, total) => {
      files = total;
      onProgress(done, total);
    });
    publish({
      phase: "idle", lastSyncedAt: new Date().toISOString(), message: null, account: readRecord()?.account ?? null,
      lastRun: files ? { files, ms: Date.now() - began } : null,
    });
  },

  /** Pre-compute the PKCE pair so the phone tap handler can open the pop-up synchronously. */
  async prepare(): Promise<void> {
    if (!prepared) prepared = { ...(await createPkce()), state: randomState() };
  },
  isPrepared: (): boolean => prepared !== null,

  /**
   * Begin signing in. Phone: opens the pop-up synchronously (call straight
   * from the tap handler, after `prepare()`), then waits for its code. Mac:
   * starts the loopback listener, then opens the browser.
   */
  async connect(): Promise<void> {
    this.cancelConnect();
    if (isTauri) {
      const p = { ...(await createPkce()), state: randomState() };
      // The listener must be up before the browser can redirect to it.
      const wait = invoke<{ code: string | null; state: string | null; error: string | null }>("oauth_wait_for_code", {
        port: LOOPBACK_PORT,
        timeoutSecs: 300,
      });
      let cancelled = false;
      const cancel = new Promise<null>((r) => {
        cancelWait = () => { cancelled = true; r(null); };
      });
      await openUrl(authorizeUrl({ appKey: DROPBOX_APP_KEY, challenge: p.challenge, state: p.state, redirectUri: MAC_REDIRECT_URI }));
      const cb = await Promise.race([
        wait.catch((e: unknown) => { if (cancelled) return null; throw e; }),
        cancel,
      ]);
      if (!cb) return; // cancelled or superseded by a newer sign-in
      cancelWait = null;
      if (cb.error) throw new Error(`Dropbox said: ${cb.error}`);
      if (cb.state !== p.state || !cb.code) throw new Error("The sign-in didn't match this request. Try again.");
      await trade(cb.code, { verifier: p.verifier, redirectUri: MAC_REDIRECT_URI });
    } else {
      const p = prepared;
      if (!p) throw new Error("Sign-in isn't ready yet. Try again in a moment.");
      prepared = null;
      ls.set(K_PKCE, JSON.stringify({ ...p, mode: "popup" }));
      const url = authorizeUrl({ appKey: DROPBOX_APP_KEY, challenge: p.challenge, state: p.state, redirectUri: webRedirectUri() });
      const waiting = waitForPopupCode(p.state);
      if (!window.open(url, POPUP_NAME)) {
        // Pop-up refused: same-window redirect instead; boot finishes the exchange.
        cancelWait?.();
        waiting.catch(() => {});
        location.assign(url);
        return;
      }
      try {
        const code = await waiting;
        await trade(code, { verifier: p.verifier, redirectUri: webRedirectUri() });
      } catch (e) {
        if ((e as Error).message === "cancelled") return;
        throw e;
      }
    }
    if (vaultKey) syncController.start(vaultKey); // phone onboarding has none yet: firstSync runs first
  },

  /** Phone fallback: open Dropbox's own code page in a new tab; `connectWithCode` finishes it. */
  startCodeFlow(): void {
    const p = prepared;
    if (!p) throw new Error("Sign-in isn't ready yet. Try again in a moment.");
    prepared = null;
    ls.set(K_PKCE, JSON.stringify({ ...p, mode: "code" }));
    window.open(authorizeUrl({ appKey: DROPBOX_APP_KEY, challenge: p.challenge, state: p.state }), "_blank");
  },
  async connectWithCode(code: string): Promise<void> {
    const stash = readStash();
    if (!stash) throw new Error("Open Dropbox first, then paste the code it shows.");
    await trade(code.trim(), { verifier: stash.verifier });
    ls.del(K_PKCE);
    if (vaultKey) syncController.start(vaultKey);
  },

  cancelConnect(): void {
    cancelWait?.();
    cancelWait = null;
  },

  /**
   * Revoke at Dropbox, then forget everything local about the connection. On the
   * phone also wipe the local copy: it is only a cache of Dropbox.
   */
  async disconnect(): Promise<void> {
    if (!isTauri && scheduler) {
      // The phone's copy is wiped below, so its last edits must reach Dropbox first.
      await scheduler.runNow();
      if (status.phase === "offline") {
        throw new Error("Your latest changes haven't reached Dropbox yet. Disconnect again once you're online.");
      }
    }
    stopScheduling();
    await (client ?? newClient()).revoke();
    await tokenStore.del();
    ls.del(K_RECORD);
    if (vaultKey) ls.del(stateKey(vaultKey));
    client = null;
    publish({ ...OFF });
    if (!isTauri) {
      const f = webFiles();
      for (const e of await f.list()) await f.removeFile(e.path);
      ls.del("ng-web-vault");
      ls.del(stateKey("dropbox"));
    }
  },

  /* ------------------------------------------------- phone page-load hooks */

  /**
   * Run before React renders. If the URL carries Dropbox's ?code&state: hand
   * it to the opener (or the BroadcastChannel when COOP cut the opener) and
   * close this pop-up (returns true: don't render); otherwise keep it for
   * onboarding to finish in place and clean the URL.
   */
  handleRedirect(): boolean {
    if (isTauri) return false;
    const q = new URLSearchParams(location.search);
    const code = q.get("code");
    const state = q.get("state");
    const error = q.get("error") ?? undefined;
    if (!state || (!code && !error)) return false;
    const msg: CodeMessage = { type: "dropbox-code", code: code ?? "", state, error };
    if (window.opener) {
      (window.opener as Window).postMessage(msg, location.origin);
      window.close();
      return true;
    }
    if (window.name === POPUP_NAME && typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(PRIVATE_CHANNEL);
      ch.postMessage(msg);
      ch.close();
      window.close();
      return true;
    }
    pendingRedirect = { code: code ?? "", state, error };
    history.replaceState(null, "", location.pathname);
    return false;
  },
  /** Finish a same-window sign-in kept by handleRedirect. Returns false if there was none. */
  async finishRedirect(): Promise<boolean> {
    const r = pendingRedirect;
    pendingRedirect = null;
    if (!r) return false;
    const stash = readStash();
    if (!stash || stash.state !== r.state) throw new Error("The sign-in didn't match this request. Try again.");
    if (r.error) {
      ls.del(K_PKCE);
      if (r.error === "access_denied") return false; // cancelled at Dropbox: back to the Connect screen
      throw new Error(`Dropbox said: ${r.error}`);
    }
    await trade(r.code, { verifier: stash.verifier, redirectUri: stash.mode === "popup" ? webRedirectUri() : undefined });
    ls.del(K_PKCE);
    return true;
  },
  hasRecord: (): boolean => readRecord() !== null,
};

/* Phone attachments: open the blank window first (iOS blocks pop-ups after an await), then point it at Dropbox. */
if (!isTauri) {
  setWebAttachmentOpener(async (path) => {
    const w = window.open("", "_blank");
    try {
      const link = await (client ?? newClient()).temporaryLink(path);
      if (w) w.location.href = link;
      else location.href = link;
    } catch (e) {
      w?.close();
      throw e;
    }
  });
}
