# Deletion model and referential integrity

There are two distinct ways to remove things, and they mean different things:

- **Dropped** (soft) is the everyday gesture for Tasks and Goals — "I'm not doing this," history preserved, still visible under the Dropped filter. This is what the UI nudges toward.
- **Hard delete** permanently removes the file. It is a separate, confirmed, secondary action — the *only* removal path for Notes (which have no status), and an available-but-not-prominent option for Tasks and Goals. Dropping ≠ deleting.

**Referential integrity for `goalId` is a two-part invariant:**

1. **The store never trusts a `goalId` blindly.** A `goalId` that resolves to no existing Goal is treated as *unlinked* — the entity loads fine and renders as having no goal. This keeps the app resilient to external/manual deletions (Dropbox, git, hand-editing the folder).
2. **In-app goal deletion proactively clears the pointer** — deleting a Goal through the app rewrites its linked Tasks/Notes to `goalId: null` so files stay clean. This is referential-integrity cleanup, not a status cascade, so it does not conflict with ADR-0002.

**Hard delete moves the file to `/.atlas/trash/` rather than `unlink`-ing it** — a zero-UI safety net for the user's only copy of irreplaceable local data, without building a full undo feature.

## Consequences

- Deleting a Goal is a multi-file write (the goal → trash, plus a `goalId: null` rewrite of each linked Task/Note); all writes remain atomic.
- `/.atlas/trash/` grows unbounded; emptying it is out of scope for v1 (the user can clear the folder by hand).
