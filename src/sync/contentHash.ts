/**
 * Dropbox's content hash: SHA-256 each 4 MiB block, concatenate the digests,
 * SHA-256 that, lowercase hex. Lets local files compare with Dropbox's
 * `content_hash` without downloading. Rust computes the same (sync_fs.rs).
 * https://www.dropbox.com/developers/reference/content-hash
 */
const BLOCK = 4 * 1024 * 1024;

export async function contentHash(bytes: Uint8Array): Promise<string> {
  const digests: Uint8Array[] = [];
  for (let at = 0; at < bytes.length; at += BLOCK) {
    digests.push(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice(at, at + BLOCK))));
  }
  const joined = new Uint8Array(digests.length * 32);
  digests.forEach((d, i) => joined.set(d, i * 32));
  const final = new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
  return Array.from(final, (b) => b.toString(16).padStart(2, "0")).join("");
}
