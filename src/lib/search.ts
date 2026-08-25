/**
 * Global search — the pure half.
 *
 * Tasks, goals, notebooks and note *titles* are already in the store, so they
 * are matched here, synchronously, with no I/O. Note *bodies* are lazy by
 * design (ADR-0006) and are searched in Rust (`ipc.searchNoteBodies`); the
 * caller merges those hits in via `bodyHits`.
 *
 * Matching is a case-insensitive substring — no fuzzy matching, no index. A
 * personal vault is small enough that anything cleverer is unearned.
 */

import type { Goal, Note, NoteBodyHit, Notebook, Task } from "@/types";

export type SearchKind = "task" | "note" | "goal" | "notebook";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** Secondary line: a body excerpt, a goal's status, a notebook's context. */
  sub?: string;
}

export interface SearchCorpus {
  tasks: Task[];
  notes: Note[];
  goals: Goal[];
  notebooks: Notebook[];
}

/** The shortest query worth running — one letter matches half the vault. */
export const MIN_QUERY = 2;

/**
 * Rank buckets, lowest first. A title you're typing the start of is almost
 * always the thing you meant; a body mention almost never is.
 */
const RANK_PREFIX = 0;
const RANK_TITLE = 1;
const RANK_BODY = 2;

/** Kind order within a rank — what you're most likely to be looking for. */
const KIND_ORDER: Record<SearchKind, number> = {
  task: 0,
  note: 1,
  goal: 2,
  notebook: 3,
};

interface Ranked extends SearchHit {
  rank: number;
}

/** Where `needle` sits in `title`: prefix, somewhere, or nowhere. */
function titleRank(title: string, needle: string): number | null {
  const t = title.toLowerCase();
  if (t.startsWith(needle)) return RANK_PREFIX;
  if (t.includes(needle)) return RANK_TITLE;
  return null;
}

/** A task's second line: its status when it isn't simply open. */
function taskSub(task: Task): string | undefined {
  if (task.status === "done") return "done";
  if (task.status === "dropped") return "dropped";
  return undefined;
}

/**
 * Search everything the store already holds, plus any note-body hits fetched
 * from Rust. Results are ordered by match quality, then by kind, then by title;
 * `limit` caps the list. Returns [] below MIN_QUERY so an empty palette stays
 * empty rather than listing the whole vault.
 */
export function searchAll(
  query: string,
  corpus: SearchCorpus,
  bodyHits: NoteBodyHit[] = [],
  limit = 12,
): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];

  const hits: Ranked[] = [];
  const seenNotes = new Set<string>();

  for (const task of corpus.tasks) {
    const rank = titleRank(task.title, needle);
    if (rank !== null) hits.push({ kind: "task", id: task.id, title: task.title, sub: taskSub(task), rank });
  }

  for (const note of corpus.notes) {
    const rank = titleRank(note.title, needle);
    if (rank !== null) {
      hits.push({ kind: "note", id: note.id, title: note.title, rank });
      seenNotes.add(note.id);
    }
  }

  for (const goal of corpus.goals) {
    const rank = titleRank(goal.title, needle);
    if (rank !== null) hits.push({ kind: "goal", id: goal.id, title: goal.title, sub: goal.status, rank });
  }

  for (const notebook of corpus.notebooks) {
    const rank = titleRank(notebook.name, needle);
    if (rank !== null) hits.push({ kind: "notebook", id: notebook.id, title: notebook.name, rank });
  }

  // Body hits last, and only for notes whose title didn't already match — one
  // note should never occupy two rows.
  const notesById = new Map(corpus.notes.map((n) => [n.id, n] as const));
  for (const hit of bodyHits) {
    if (seenNotes.has(hit.id)) continue;
    const note = notesById.get(hit.id);
    if (!note) continue; // a file Rust can see but the store hasn't loaded
    seenNotes.add(hit.id);
    hits.push({ kind: "note", id: note.id, title: note.title, sub: hit.snippet, rank: RANK_BODY });
  }

  hits.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });

  return hits.slice(0, limit).map(({ rank: _rank, ...hit }) => hit);
}
