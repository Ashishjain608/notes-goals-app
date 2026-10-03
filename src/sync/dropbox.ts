/** Dropbox OAuth (PKCE) and the App Folder client (docs/adr/0011). */
import { contentHash } from "./contentHash";
import { AuthLostError, RemoteConflictError, type Remote, type RemoteEntry } from "./types";
import { unzip } from "./zip";

type Fetch = typeof fetch;

const API = "https://api.dropboxapi.com";
const CONTENT = "https://content.dropboxapi.com";
const TOKEN_URL = `${API}/oauth2/token`;
const MAX_UPLOAD = 150 * 1024 * 1024;
const MAX_RETRIES = 3;

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** PKCE S256 challenge: base64url(SHA-256(verifier)), no padding. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** A fresh PKCE verifier (48 random bytes, base64url) and its challenge. */
export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  return { verifier, challenge: await challengeFor(verifier) };
}

/** The Dropbox consent page. Without `redirectUri` Dropbox shows a code to copy. */
export function authorizeUrl(p: { appKey: string; challenge: string; state: string; redirectUri?: string }): string {
  const q = new URLSearchParams({
    client_id: p.appKey,
    response_type: "code",
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
    state: p.state,
  });
  if (p.redirectUri) q.set("redirect_uri", p.redirectUri);
  return `https://www.dropbox.com/oauth2/authorize?${q}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  account_id?: string;
}

async function postToken(f: Fetch, form: Record<string, string>): Promise<Response> {
  return f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
}

/** Trade the authorization code for tokens. */
export async function exchangeCode(p: {
  appKey: string;
  code: string;
  verifier: string;
  redirectUri?: string;
  fetch?: Fetch;
}): Promise<{ refreshToken: string; accessToken: string; expiresAt: number; accountId: string }> {
  const form: Record<string, string> = {
    grant_type: "authorization_code",
    code: p.code,
    client_id: p.appKey,
    code_verifier: p.verifier,
  };
  if (p.redirectUri) form.redirect_uri = p.redirectUri;
  const res = await postToken(p.fetch ?? globalThis.fetch.bind(globalThis), form);
  if (!res.ok) throw await failure(res);
  const t = (await res.json()) as TokenResponse;
  return {
    refreshToken: t.refresh_token ?? "",
    accessToken: t.access_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    accountId: t.account_id ?? "",
  };
}

async function failure(res: Response): Promise<Error> {
  const text = await res.text().catch(() => "");
  let summary = text;
  try {
    summary = (JSON.parse(text) as { error_summary?: string }).error_summary ?? text;
  } catch {
    /* not JSON: keep the raw text */
  }
  return new Error(`Dropbox ${res.status}: ${summary}`);
}

/** Dropbox-API-Arg must be ASCII: escape every UTF-16 unit above 0x7E. */
function apiArg(arg: unknown): string {
  return JSON.stringify(arg).replace(
    /[^\x00-\x7e]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

interface Metadata {
  ".tag": string;
  path_display: string;
  rev: string;
  size: number;
  content_hash: string;
}

const toEntry = (m: Metadata): RemoteEntry => ({
  path: m.path_display.replace(/^\//, ""),
  rev: m.rev,
  size: m.size,
  contentHash: m.content_hash,
});

export interface DropboxClientOptions {
  appKey: string;
  getRefreshToken: () => Promise<string | null>;
  fetch?: Fetch;
  /** Test hook for Retry-After waits. */
  sleep?: (ms: number) => Promise<void>;
}

interface CallInit {
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

/** The Dropbox App Folder over HTTP. Access tokens live in memory only. */
export class DropboxClient implements Remote {
  private token: { value: string; expiresAt: number } | null = null;
  private refreshing: Promise<string> | null = null;
  private readonly f: Fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: DropboxClientOptions) {
    this.f = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private accessToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.token.expiresAt - 60_000) {
      return Promise.resolve(this.token.value);
    }
    this.refreshing ??= this.refresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    const refreshToken = await this.opts.getRefreshToken();
    if (!refreshToken) throw new AuthLostError();
    const res = await postToken(this.f, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.opts.appKey,
    });
    if (res.status === 400 || res.status === 401) throw new AuthLostError();
    if (!res.ok) throw await failure(res);
    const t = (await res.json()) as TokenResponse;
    this.token = { value: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
    return t.access_token;
  }

  /** POST with auth, one forced refresh on 401, and Retry-After on 429/503. */
  private async call(url: string, init: CallInit): Promise<Response> {
    let refreshed = false;
    for (let retries = 0; ; ) {
      const token = await this.accessToken();
      let res: Response;
      try {
        res = await this.f(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, ...init.headers },
          body: init.body as BodyInit | undefined,
        });
      } catch (e) {
        // Dropbox's 429s carry no CORS headers, so a browser reports a throttled
        // request as a network failure (TypeError): back off and retry it too.
        if (!(e instanceof TypeError) || retries >= MAX_RETRIES) throw e;
        await this.sleep(1000 * 2 ** retries++);
        continue;
      }
      if (res.status === 401) {
        if (refreshed) throw new AuthLostError();
        refreshed = true;
        await this.accessToken(true);
        continue;
      }
      if ((res.status === 429 || res.status === 503) && retries < MAX_RETRIES) {
        retries++;
        const wait = Math.min(Number(res.headers.get("Retry-After")) || 1, 60);
        await this.sleep(wait * 1000);
        continue;
      }
      return res;
    }
  }

  private async rpc(path: string, body: unknown): Promise<Response> {
    return this.call(`${API}${path}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async listAll(): Promise<RemoteEntry[]> {
    const entries: RemoteEntry[] = [];
    let res = await this.rpc("/2/files/list_folder", {
      path: "", recursive: true, include_deleted: false, limit: 2000,
    });
    for (;;) {
      if (!res.ok) throw await failure(res);
      const page = (await res.json()) as { entries: Metadata[]; cursor: string; has_more: boolean };
      for (const m of page.entries) if (m[".tag"] === "file") entries.push(toEntry(m));
      if (!page.has_more) return entries;
      res = await this.rpc("/2/files/list_folder/continue", { cursor: page.cursor });
    }
  }

  async download(path: string): Promise<{ bytes: Uint8Array; entry: RemoteEntry }> {
    const res = await this.call(`${CONTENT}/2/files/download`, {
      headers: { "Dropbox-API-Arg": apiArg({ path: "/" + path }) },
    });
    if (!res.ok) throw await failure(res);
    const entry = toEntry(JSON.parse(res.headers.get("Dropbox-API-Result") ?? "{}") as Metadata);
    return { bytes: new Uint8Array(await res.arrayBuffer()), entry };
  }

  async downloadFolder(folder: string): Promise<Map<string, { bytes: Uint8Array; contentHash: string }>> {
    const res = await this.call(`${CONTENT}/2/files/download_zip`, {
      headers: { "Dropbox-API-Arg": apiArg({ path: "/" + folder }) },
    });
    if (!res.ok) throw await failure(res);
    const out = new Map<string, { bytes: Uint8Array; contentHash: string }>();
    const prefix = folder.toLowerCase() + "/";
    for (const [name, bytes] of await unzip(new Uint8Array(await res.arrayBuffer()))) {
      // Entries should sit under the folder's own name; tolerate a zip rooted inside it.
      const key = name.toLowerCase().startsWith(prefix) ? name.toLowerCase() : prefix + name.toLowerCase();
      out.set(key, { bytes, contentHash: await contentHash(bytes) });
    }
    return out;
  }

  async upload(path: string, bytes: Uint8Array, rev: string | null | "overwrite"): Promise<RemoteEntry> {
    // ponytail: single-request upload caps at 150 MB; add upload sessions if attachments get that big
    if (bytes.length > MAX_UPLOAD) throw new Error(`${path} is over 150 MB; upload sessions are not implemented`);
    const mode = rev === null ? "add" : rev === "overwrite" ? "overwrite" : { ".tag": "update", update: rev };
    const res = await this.call(`${CONTENT}/2/files/upload`, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": apiArg({
          path: "/" + path, mode, autorename: false, mute: true, strict_conflict: true,
        }),
      },
      body: bytes,
    });
    if (res.status === 409) {
      const err = await failure(res);
      if (/conflict/.test(err.message)) throw new RemoteConflictError(path);
      throw err;
    }
    if (!res.ok) throw await failure(res);
    return toEntry((await res.json()) as Metadata);
  }

  async remove(path: string, rev: string): Promise<void> {
    const res = await this.rpc("/2/files/delete_v2", { path: "/" + path, parent_rev: rev });
    if (res.ok) return;
    if (res.status === 409) {
      const err = await failure(res);
      if (/not_found/.test(err.message)) return;
      throw new RemoteConflictError(path);
    }
    throw await failure(res);
  }

  async account(): Promise<{ name: string; email: string }> {
    const res = await this.call(`${API}/2/users/get_current_account`, {
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    if (!res.ok) throw await failure(res);
    const a = (await res.json()) as { name: { display_name: string }; email: string };
    return { name: a.name.display_name, email: a.email };
  }

  async temporaryLink(path: string): Promise<string> {
    const res = await this.rpc("/2/files/get_temporary_link", { path: "/" + path });
    if (!res.ok) throw await failure(res);
    return ((await res.json()) as { link: string }).link;
  }

  /** Revoke the token at Dropbox. Best effort: errors are swallowed. */
  async revoke(): Promise<void> {
    try {
      await this.call(`${API}/2/auth/token/revoke`, {});
    } catch {
      /* already revoked or offline: local sign-out still proceeds */
    }
  }
}
