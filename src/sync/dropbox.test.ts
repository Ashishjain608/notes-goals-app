/** Tests for the Dropbox PKCE helpers and client, against a scripted fake fetch. */
import { describe, expect, it } from "vitest";
import { authorizeUrl, challengeFor, createPkce, DropboxClient, exchangeCode } from "./dropbox";
import { AuthLostError, RemoteConflictError } from "./types";

interface Call { url: string; init: RequestInit & { headers: Record<string, string> } }

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const tokenOk = (n = 1) => json({ access_token: `at${n}`, expires_in: 14400 });
const META = { ".tag": "file", path_display: "/tasks/a.json", rev: "r1", size: 3, content_hash: "h1" };

function setup(script: (call: Call, n: number) => Response) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const client = new DropboxClient({
    appKey: "key",
    getRefreshToken: async () => "rt",
    fetch: (async (url: string, init: Call["init"]) => {
      calls.push({ url, init });
      return script({ url, init }, calls.length);
    }) as unknown as typeof fetch,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { client, calls, sleeps };
}
const isToken = (c: Call) => c.url.endsWith("/oauth2/token");

describe("PKCE", () => {
  it("matches the RFC 7636 Appendix B vector", async () => {
    expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("creates a 64-char url-safe verifier with a matching challenge", async () => {
    const { verifier, challenge } = await createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(challenge).toBe(await challengeFor(verifier));
  });

  it("builds the authorize url, redirect_uri only when given", () => {
    const base = { appKey: "k", challenge: "c", state: "s" };
    const u = new URL(authorizeUrl(base));
    expect(u.origin + u.pathname).toBe("https://www.dropbox.com/oauth2/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "k", response_type: "code", code_challenge: "c",
      code_challenge_method: "S256", token_access_type: "offline", state: "s",
    });
    expect(new URL(authorizeUrl({ ...base, redirectUri: "http://x/cb" })).searchParams.get("redirect_uri")).toBe("http://x/cb");
  });

  it("exchanges a code with a form body", async () => {
    let seen: Call | undefined;
    const out = await exchangeCode({
      appKey: "k", code: "abc", verifier: "v",
      fetch: (async (url: string, init: Call["init"]) => {
        seen = { url, init };
        return json({ access_token: "a", refresh_token: "r", expires_in: 100, account_id: "dbid:1" });
      }) as unknown as typeof fetch,
    });
    expect(seen!.url).toBe("https://api.dropboxapi.com/oauth2/token");
    expect(String(seen!.init.body)).toBe("grant_type=authorization_code&code=abc&client_id=k&code_verifier=v");
    expect(out).toMatchObject({ refreshToken: "r", accessToken: "a", accountId: "dbid:1" });
    expect(out.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe("DropboxClient", () => {
  it("refreshes once, caches the token, and paginates listAll keeping files only", async () => {
    const { client, calls } = setup((c) => {
      if (isToken(c)) return tokenOk();
      if (c.url.endsWith("/list_folder"))
        return json({ entries: [META, { ".tag": "folder", path_display: "/tasks" }], cursor: "cur", has_more: true });
      return json({ entries: [{ ...META, path_display: "/notes/b.json" }], cursor: "c2", has_more: false });
    });
    const all = await client.listAll();
    expect(all.map((e) => e.path)).toEqual(["tasks/a.json", "notes/b.json"]);
    expect(all[0]).toEqual({ path: "tasks/a.json", rev: "r1", size: 3, contentHash: "h1" });
    expect(String(calls[0]!.init.body)).toBe("grant_type=refresh_token&refresh_token=rt&client_id=key");
    expect(calls.filter(isToken)).toHaveLength(1);
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ path: "", recursive: true, include_deleted: false, limit: 2000 });
    expect(calls[1]!.init.headers.Authorization).toBe("Bearer at1");
    expect(calls[2]!.url).toBe("https://api.dropboxapi.com/2/files/list_folder/continue");
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ cursor: "cur" });
  });

  it("retries once after a 401 with a fresh token, then gives up with AuthLostError", async () => {
    let tokens = 0;
    const ok = setup((c) => {
      if (isToken(c)) return tokenOk(++tokens);
      return c.init.headers.Authorization === "Bearer at1" ? new Response("", { status: 401 }) : json({ entries: [], cursor: "", has_more: false });
    });
    expect(await ok.client.listAll()).toEqual([]);
    expect(ok.calls.filter(isToken)).toHaveLength(2);

    const bad = setup((c) => (isToken(c) ? tokenOk() : new Response("", { status: 401 })));
    await expect(bad.client.listAll()).rejects.toBeInstanceOf(AuthLostError);
  });

  it("throws AuthLostError for a null refresh token or an invalid_grant refresh", async () => {
    const none = new DropboxClient({ appKey: "k", getRefreshToken: async () => null, fetch: (async () => json({})) as unknown as typeof fetch });
    await expect(none.listAll()).rejects.toBeInstanceOf(AuthLostError);
    const { client } = setup(() => json({ error: "invalid_grant" }, 400));
    await expect(client.listAll()).rejects.toBeInstanceOf(AuthLostError);
  });

  it("downloads bytes and reads the entry from the result header", async () => {
    const { client, calls } = setup((c) =>
      isToken(c) ? tokenOk() : new Response(new Uint8Array([1, 2, 3]), { headers: { "Dropbox-API-Result": JSON.stringify(META) } }),
    );
    const { bytes, entry } = await client.download("tasks/a.json");
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(entry.rev).toBe("r1");
    expect(calls[1]!.url).toBe("https://content.dropboxapi.com/2/files/download");
    expect(JSON.parse(calls[1]!.init.headers["Dropbox-API-Arg"]!)).toEqual({ path: "/tasks/a.json" });
  });

  it("uploads with the right mode per rev, escaping non-ASCII in the arg header", async () => {
    const { client, calls } = setup((c) => (isToken(c) ? tokenOk() : json(META)));
    await client.upload("attachments/x/café 📎.png", new Uint8Array([9]), null);
    await client.upload("a", new Uint8Array(), "overwrite");
    await client.upload("a", new Uint8Array(), "r7");
    const arg = (i: number) => calls[i]!.init.headers["Dropbox-API-Arg"]!;
    expect(arg(1)).toBe(
      '{"path":"/attachments/x/caf\\u00e9 \\ud83d\\udcce.png","mode":"add","autorename":false,"mute":true,"strict_conflict":true}',
    );
    expect(calls[1]!.init.headers["Content-Type"]).toBe("application/octet-stream");
    expect(JSON.parse(arg(2)).mode).toBe("overwrite");
    expect(JSON.parse(arg(3)).mode).toEqual({ ".tag": "update", update: "r7" });
  });

  it("maps upload 409 conflict to RemoteConflictError and other 409s to Error", async () => {
    const mk = (summary: string) => setup((c) => (isToken(c) ? tokenOk() : json({ error_summary: summary }, 409))).client;
    await expect(mk("path/conflict/file/..").upload("a", new Uint8Array(), "r")).rejects.toBeInstanceOf(RemoteConflictError);
    await expect(mk("path/disallowed_name/..").upload("a", new Uint8Array(), "r")).rejects.toThrow(/409.*disallowed_name/);
  });

  it("rejects uploads over 150 MB without calling the network", async () => {
    const { client, calls } = setup(() => tokenOk());
    await expect(client.upload("big", { length: 151 * 1024 * 1024 } as Uint8Array, null)).rejects.toThrow(/150 MB/);
    expect(calls).toHaveLength(0);
  });

  it("remove: sends parent_rev, treats not_found as done, other 409 as conflict", async () => {
    const ok = setup((c) => (isToken(c) ? tokenOk() : json({})));
    await ok.client.remove("a.json", "r1");
    expect(JSON.parse(String(ok.calls[1]!.init.body))).toEqual({ path: "/a.json", parent_rev: "r1" });
    const gone = setup((c) => (isToken(c) ? tokenOk() : json({ error_summary: "path_lookup/not_found/." }, 409)));
    await expect(gone.client.remove("a", "r")).resolves.toBeUndefined();
    const stale = setup((c) => (isToken(c) ? tokenOk() : json({ error_summary: "path_write/conflict" }, 409)));
    await expect(stale.client.remove("a", "r")).rejects.toBeInstanceOf(RemoteConflictError);
  });

  it("account, temporaryLink and revoke", async () => {
    const { client, calls } = setup((c) => {
      if (isToken(c)) return tokenOk();
      if (c.url.endsWith("get_current_account")) return json({ name: { display_name: "Ash" }, email: "a@b.c" });
      if (c.url.endsWith("get_temporary_link")) return json({ link: "https://l" });
      return new Response("nope", { status: 500 });
    });
    expect(await client.account()).toEqual({ name: "Ash", email: "a@b.c" });
    expect(calls[1]!.init.body).toBe("null");
    expect(calls[1]!.init.headers["Content-Type"]).toBe("application/json");
    expect(await client.temporaryLink("a/b.png")).toBe("https://l");
    await expect(client.revoke()).resolves.toBeUndefined();
  });

  it("honours Retry-After (capped at 60s) up to 3 times, then fails with status and summary", async () => {
    const { client, sleeps } = setup((c) =>
      isToken(c) ? tokenOk() : json({ error_summary: "too_many_requests/" }, 429, { "Retry-After": "120" }),
    );
    await expect(client.listAll()).rejects.toThrow(/429.*too_many_requests/);
    expect(sleeps).toEqual([60000, 60000, 60000]);
  });

  it("recovers when a 503 clears", async () => {
    let hits = 0;
    const { client, sleeps } = setup((c) => {
      if (isToken(c)) return tokenOk();
      return ++hits === 1 ? new Response("", { status: 503, headers: { "Retry-After": "2" } }) : json({ entries: [], cursor: "", has_more: false });
    });
    await client.listAll();
    expect(sleeps).toEqual([2000]);
  });
});
