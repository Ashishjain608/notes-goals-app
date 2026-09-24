/**
 * Helpers for turning a clipboard-pasted `File` into an attachment the
 * `attach_bytes` IPC command accepts — the MIME→extension guess and the
 * "pasted-<ts>.<ext>" fallback name, shared by the task and note attach flows
 * so the two don't drift.
 */

/** Best-guess filename extension for a MIME type (clipboard files often arrive unnamed). */
export function extensionForMime(mime: string): string {
  const known: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  return known[mime] ?? mime.split("/")[1] ?? "bin";
}

/** A filename for a pasted file: its own name if it has one, else a timestamped placeholder. */
export function pastedFileName(file: File, now: number = Date.now()): string {
  return file.name.trim() || `pasted-${now}.${extensionForMime(file.type)}`;
}

/** Read a File's bytes as the plain array `ipc.attachBytes` expects. */
export async function fileBytes(file: File): Promise<number[]> {
  return Array.from(new Uint8Array(await file.arrayBuffer()));
}
