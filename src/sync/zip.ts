/**
 * A minimal zip reader for Dropbox's download_zip: walks the central
 * directory, reads stored and deflated entries (zip64 included), and inflates
 * with the platform's DecompressionStream, so no dependency.
 */

const u16 = (d: DataView, at: number) => d.getUint16(at, true);
const u32 = (d: DataView, at: number) => d.getUint32(at, true);
const u64 = (d: DataView, at: number) => Number(d.getBigUint64(at, true));
const FULL = 0xffffffff;

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Every file in the zip by its stored name (UTF-8). Folder entries are skipped. Throws on anything it can't read. */
export async function unzip(zip: Uint8Array): Promise<Map<string, Uint8Array>> {
  const d = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && u32(d, end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("Not a zip file");
  let count = u16(d, end + 10);
  let at = u32(d, end + 16);
  if (count === 0xffff || at === FULL) {
    // zip64: the real count and offset live in the zip64 end record, found through its locator.
    if (u32(d, end - 20) !== 0x07064b50) throw new Error("Zip64 locator missing");
    const end64 = u64(d, end - 12);
    count = u64(d, end64 + 32);
    at = u64(d, end64 + 48);
  }

  const utf8 = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (u32(d, at) !== 0x02014b50) throw new Error("Zip directory is corrupt");
    const method = u16(d, at + 10);
    let packed = u32(d, at + 20);
    let size = u32(d, at + 24);
    const nameLen = u16(d, at + 28);
    const extraLen = u16(d, at + 30);
    let local = u32(d, at + 42);
    const name = utf8.decode(zip.subarray(at + 46, at + 46 + nameLen));
    // The zip64 extra field (id 1) holds, in order, each size/offset that overflowed to 0xffffffff.
    for (let x = at + 46 + nameLen; x + 4 <= at + 46 + nameLen + extraLen; x += 4 + u16(d, x + 2)) {
      if (u16(d, x) !== 1) continue;
      let p = x + 4;
      const next = () => ((p += 8), u64(d, p - 8));
      if (size === FULL) size = next();
      if (packed === FULL) packed = next();
      if (local === FULL) local = next();
    }
    at += 46 + nameLen + extraLen + u16(d, at + 32);
    if (name.endsWith("/")) continue;

    if (u32(d, local) !== 0x04034b50) throw new Error(`Zip entry ${name} is corrupt`);
    const start = local + 30 + u16(d, local + 26) + u16(d, local + 28);
    const raw = zip.subarray(start, start + packed);
    const bytes = method === 0 ? raw.slice() : method === 8 ? await inflate(raw) : null;
    if (!bytes) throw new Error(`Zip entry ${name} uses unsupported compression ${method}`);
    if (bytes.length !== size) throw new Error(`Zip entry ${name} is truncated`);
    out.set(name, bytes);
  }
  return out;
}
