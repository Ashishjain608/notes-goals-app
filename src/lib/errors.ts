/**
 * Shared error-to-message coercion. Every mutating action (store, and the
 * views that still call `@/lib/ipc` directly during the migration) needs to
 * turn a thrown value into something a user can read; this is the one place
 * that logic lives.
 */

/** Coerce an unknown thrown value into a human-readable message. */
export function errorMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong.";
}
