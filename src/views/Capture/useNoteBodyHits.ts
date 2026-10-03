/**
 * useNoteBodyHits — debounced note-body search shared by the desktop palette
 * and the phone search overlay.
 *
 * Note bodies live on disk (ADR-0006); matches are fetched after typing settles.
 * A failure (no vault yet, unreadable file) simply means no hits, never a crash.
 * Pass "" to disable (e.g. while closed). Stale responses are discarded.
 */
import { useEffect, useState } from "react";
import type { NoteBodyHit } from "@/types";
import { useStore } from "@/store";
import { MIN_QUERY } from "@/lib/search";

/** How long typing has to settle before the note bodies are read off disk. */
export const BODY_SEARCH_DEBOUNCE_MS = 140;

/** Body hits for an already-trimmed `query`; [] below MIN_QUERY. */
export function useNoteBodyHits(query: string): NoteBodyHit[] {
  const searchNoteBodies = useStore((s) => s.searchNoteBodies);
  const [bodyHits, setBodyHits] = useState<NoteBodyHit[]>([]);

  useEffect(() => {
    if (query.length < MIN_QUERY) {
      setBodyHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchNoteBodies(query)
        .then((hits) => {
          if (!cancelled) setBodyHits(hits);
        })
        .catch(() => {
          if (!cancelled) setBodyHits([]);
        });
    }, BODY_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchNoteBodies]);

  return bodyHits;
}
