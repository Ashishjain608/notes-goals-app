/**
 * Pure save composition for the note editor's autosave path.
 *
 * The editor persists a note as `{ store note } + { filing patches } + { working
 * title/context/attachments }`. Composing it in one place means every write —
 * the 800ms autosave, a flush, a filing change — carries the SAME latest values,
 * so a pending autosave can never write an old notebook/goal back (the race
 * that a separate `moveNoteToNotebook` call would lose).
 */
import type { Attachment, Context, Note } from "@/types";

export interface WorkingNote {
  title: string;
  context: Context;
  attachments: Attachment[];
}

/**
 * `base` is the freshest store copy of the note, `patch` the filing changes made
 * since that copy was read (not yet reflected in `base`), `working` the live
 * editor state. Precedence: working > patch > base.
 */
export function composeNoteSave(base: Note, patch: Partial<Note>, working: WorkingNote): Note {
  return { ...base, ...patch, ...working };
}

/** Pick the freshest copy of `target`: the live store note when it is the same note. */
export function freshestNote(target: Note, live: Note | null): Note {
  return live && live.id === target.id ? live : target;
}

/** Drop the patch keys the incoming store note already carries (it absorbed them); keep the rest. */
export function settlePatch(patch: Partial<Note>, incoming: Note | null): Partial<Note> {
  if (!incoming) return patch;
  const rest: Partial<Note> = {};
  for (const k of Object.keys(patch) as (keyof Note)[]) {
    if (patch[k] !== incoming[k]) (rest as Record<string, unknown>)[k] = patch[k];
  }
  return rest;
}
