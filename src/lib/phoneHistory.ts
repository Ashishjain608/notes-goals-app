/**
 * Phone overlays join browser history (ADR-0012), so iOS's edge swipe-back in
 * a Home Screen app closes the top sheet/composer/editor instead of leaving
 * the app. Desktop never registers a layer, so it never touches history.
 *
 * Model: a stack of open layers, and history entries tagged with a depth.
 * After every change the entries are reconciled to the stack size: more
 * layers → push entries; fewer → `history.go(-n)`. Reconciling on a
 * microtask coalesces a close-then-open in one tick (FAB menu → composer)
 * into zero history traffic, the new layer reusing the old one's entry.
 * A `popstate` the app didn't cause (swipe-back) closes every layer above
 * the entry's depth; one landing deeper than the stack (swipe-forward) is
 * walked back. `go(0)` is never called (it reloads).
 */
import { useEffect, useRef } from "react";

const DEPTH_KEY = "ngLayerDepth";

export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  go(delta: number): void;
}

function depthOf(state: unknown): number {
  const d = (state as Record<string, unknown> | null)?.[DEPTH_KEY];
  return typeof d === "number" ? d : 0;
}

export interface LayerHistory {
  /** Register an open layer (re-registering an id just updates its close). */
  push: (id: string, close: () => void) => void;
  /** The layer closed itself (Done, scrim, Escape): drop it and its entry. */
  remove: (id: string) => void;
  /** Feed every `popstate` here. */
  onPopState: (state: unknown) => void;
  size: () => number;
}

export function createLayerHistory(
  history: HistoryLike,
  schedule: (fn: () => void) => void = queueMicrotask,
): LayerHistory {
  const stack: { id: string; close: () => void }[] = [];
  let depth = depthOf(history.state);
  let traversing = false;
  let scheduled = false;

  function reconcile(): void {
    scheduled = false;
    if (traversing) return; // the popstate we're waiting for reconciles again
    if (stack.length > depth) {
      while (depth < stack.length) {
        depth += 1;
        history.pushState({ [DEPTH_KEY]: depth }, "");
      }
    } else if (stack.length < depth) {
      traversing = true;
      history.go(stack.length - depth);
    }
  }

  function request(): void {
    if (scheduled) return;
    scheduled = true;
    schedule(reconcile);
  }

  return {
    push(id, close) {
      const existing = stack.find((l) => l.id === id);
      if (existing) {
        existing.close = close;
        return;
      }
      stack.push({ id, close });
      request();
    },
    remove(id) {
      const i = stack.findIndex((l) => l.id === id);
      if (i < 0) return;
      stack.splice(i, 1);
      request();
    },
    onPopState(state) {
      depth = depthOf(state);
      if (traversing) {
        traversing = false;
      } else {
        while (stack.length > depth) stack.pop()?.close();
      }
      request();
    },
    size: () => stack.length,
  };
}

let shared: LayerHistory | null = null;

function layers(): LayerHistory {
  if (!shared) {
    const created = createLayerHistory(window.history);
    window.addEventListener("popstate", (e) => created.onPopState(e.state));
    shared = created;
  }
  return shared;
}

/**
 * While `open`, hold a history entry for this layer; swipe-back calls `close`.
 * Closing any other way (setting `open` false, unmounting) releases the entry.
 * Pass `enabled: false` off the phone.
 */
export function usePhoneLayer(id: string, open: boolean, close: () => void, enabled = true): void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open || !enabled) return;
    const l = layers();
    l.push(id, () => closeRef.current());
    return () => l.remove(id);
  }, [id, open, enabled]);
}
