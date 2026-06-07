# Single-level subtasks, not a recursive tree

The build brief specified subtasks as a recursive tree of arbitrary depth, but the UX design only ever drew a flat, single-level checklist (one row of checkboxes plus an "add subtask" input). We chose **single-level subtasks** — `{ id, title, status: "open" | "done" }` — because it is the only subtask UI that was actually designed and it honors the product's "ruthlessly minimal, Things/Bear not Notion" north star; arbitrary-depth nesting is a Notion-flavored feature we are deliberately not building.

We keep a `status` enum (rather than the design's `done` boolean) so subtasks share the Task status vocabulary. Deepening a flat list into a tree later is a clean fast-follow if ever needed; this decision shapes the Task JSON on disk, so it is recorded here.

## Considered Options

- **Recursive tree, arbitrary depth** (brief's literal spec) — rejected: no UI designed for it; contradicts the minimal-product principle.
- **Flat, `done` boolean** (design's literal shape) — rejected: gratuitously diverges from the Task status vocabulary.
- **Flat, `status` enum** (chosen) — matches the designed UI, consistent vocabulary.
