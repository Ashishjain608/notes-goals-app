import { describe, expect, it } from "vitest";
import { contentHash } from "./contentHash";

const sha = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b.slice()));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const MiB4 = 4 * 1024 * 1024;

describe("contentHash", () => {
  it("hashes an empty file as SHA-256 of no digests", async () => {
    expect(await contentHash(new Uint8Array())).toBe(hex(await sha(new Uint8Array())));
  });

  it("splits at 4 MiB and hashes the joined block digests", async () => {
    const bytes = new Uint8Array(MiB4 + 1).fill(7);
    const joined = new Uint8Array(64);
    joined.set(await sha(bytes.subarray(0, MiB4)), 0);
    joined.set(await sha(bytes.subarray(MiB4)), 32);
    expect(await contentHash(bytes)).toBe(hex(await sha(joined)));
  });

  it("hashes a small file as SHA-256 of its one block digest", async () => {
    const one = await sha(new TextEncoder().encode("hello"));
    expect(await contentHash(new TextEncoder().encode("hello"))).toBe(hex(await sha(one)));
  });
});
