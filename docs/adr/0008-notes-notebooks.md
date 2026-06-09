# Notes Notebooks: virtual, context-scoped, single-level containers

Notes were flat. A **Notebook** introduces one level of organization: a user-created, named container that groups Notes (see CONTEXT.md). This ADR records *how* Notebooks are modeled, because several of the choices are hard to reverse and would otherwise surprise a future reader.

## Decisions

**Notebooks are virtual — the `.md` files stay flat.** A Notebook is a lightweight entity stored one-file-per-notebook as `notebooks/<id>.json` (`{ id, name, context, created, updated }`). A Note gains an optional `notebookId` pointer in its YAML frontmatter; membership is resolved live by matching pointers. Notes are **not** moved into on-disk subdirectories. `notebookId` mirrors the existing `goalId` relationship exactly: a dangling pointer is *unfiled*, never an error (ADR-0003), and `notebookId` is `#[serde(default)]` so notes written before this field load fine.

**Notebooks are Context-scoped, and their Context is immutable.** A Notebook belongs to exactly one Context (`office` | `personal`) and holds only Notes of that Context. The invariant — *every Note in a Notebook shares that Notebook's Context* — is enforced two ways:
- **Read side:** a Note whose `notebookId` resolves to no Notebook, or to a Notebook of a *different* Context, renders as **Unfiled**. Resilient to hand-edited vaults.
- **Write side (proactive cleanup):** changing a Note's Context away from its Notebook's (in either direction) silently clears `notebookId` — the Note becomes Unfiled in its new Context. A Notebook's own Context never changes after creation (you may rename it, but not re-Context it), so a Notebook can never bulk-orphan or bulk-mutate its members.

**Notebooks are single-level and single-membership.** Notebooks do not nest, and a Note belongs to at most one Notebook. This matches the app's calm ethos and the single-level-subtasks precedent (ADR-0001); it is what distinguishes a Notebook from a tag.

**Deleting a Notebook never deletes its Notes.** Deletion clears `notebookId` on every member (bodies preserved) — they become Unfiled — and moves the Notebook file to `.atlas/trash/`. This is referential-integrity cleanup, identical in spirit to `delete_goal` (ADR-0003), not a cascade.

**Notebook and Goal are independent axes.** A Note's Notebook and its (currently dormant) Goal link never affect each other; filing a Note touches neither its Context's meaning nor its Goal.

Notebooks are ordered alphabetically by name within the displayed Context(s); Notes inside keep the existing most-recently-updated order. Identity is the uuid, so two Notebooks may share a name.

## Considered options

- **Real on-disk directories (`notes/<notebook>/<id>.md`).** Rejected. The whole storage layer is built on an `id → notes/<id>.md` invariant (`load_note_body(id)` resolves by id alone; `list_files` is non-recursive). Real directories would force an id→path index or recursive scans, turn every rename into an N-file move, and complicate trash and name collisions — a large change for a cosmetic gain. The "plain inspectable files" value is about the *files* being portable markdown/JSON, which virtual Notebooks preserve; the grouping is metadata.
- **Context-agnostic Notebooks** (a Notebook holds notes of any Context). Rejected for this build: the user chose per-Context separation. Recorded here because it is the natural alternative if that preference changes.
- **A string `notebook` name on each Note (no Notebook entity).** Rejected: you could not create an empty Notebook up front and then file into it, which is the core flow.

## Consequences

- Existing vaults need no migration: notes without `notebookId` default to Unfiled, and the `notebooks/` subfolder is created on next vault init.
- Moving a note is a metadata-only write (`move_note` rewrites frontmatter, preserves the body); deleting a Notebook is a multi-file write (clear each member + trash the notebook), all atomic.
- `.atlas/trash/` growth is unbounded, as with all deletes (ADR-0003).
