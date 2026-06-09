# Notes & Goals

A calm, local-first, single-user macOS app that unifies daily tasks, notes, and longer-term goals — all stored as plain inspectable files in a user-chosen folder. This glossary defines the domain language; it is not a spec.

## Language

**Notes & Goals**:
The application. A single-user, offline, local-first productivity tool — Things/Bear in spirit, never Notion/ClickUp.
_Avoid_: "Atlas" (an early code name from the build brief), "the vault" (that's the data folder, not the app).

**Task**:
A single thing the user intends to do; the source of truth for what's outstanding. Always belongs to exactly one Context and is in exactly one Status.
_Avoid_: todo, item, card.

**Note**:
A piece of long-form writing, authored WYSIWYG and stored as portable Markdown. Optionally owned by one Goal.
_Avoid_: doc, page, entry.

**Notebook**:
A user-created, named container that groups Notes for organization, and nothing more. Belongs to exactly one Context and holds only Notes of that Context. A Note belongs to at most one Notebook (or none); a Notebook's Note list is never stored — it is computed live from the Notes that point to it, so a Notebook may be empty. Notebooks do not nest. Purely organizational: a Notebook carries no Status, progress, or date — that is what distinguishes it from a Goal, which a Note may *also* be linked to independently.
_Avoid_: folder (that is the **Data folder** / vault — a real directory on disk; a Notebook is virtual and is **not** a directory), tag/label (those imply many-membership; a Note has at most one Notebook), category, notebook-as-Goal.

**Unfiled**:
The live set of Notes that belong to no Notebook. Not a stored Notebook — it is the absence of one, surfaced as its own group. **File** is the verb for putting a Note into a Notebook (and *unfiling* removes it); a Note also becomes Unfiled when its Notebook is deleted or its Context changes away from the Notebook's.
_Avoid_: inbox (a non-term — see Today), uncategorized, root.

**Goal**:
A longer-term aspiration or project promoted to a first-class object. Its task list and note list are never stored — they are computed live from everything pointing at it.
_Avoid_: project (the user's prior word for it — Goal is the canonical term), objective, milestone.

**Context**:
The single dimension that classifies every Task, Note, and Goal as either `office` or `personal`. Also the name of the global filter (`office` | `personal` | `all`) applied across all views.
_Avoid_: workspace, profile, tag, category, area.

**Status** (of a Task):
Exactly one of `open`, `done`, `dropped`. "Snoozed" is NOT a status (see Snooze).
_Avoid_: cancelled (use `dropped`), deferred, archived, complete (use `done`).

**Dropped**:
A Task the user has decided not to do. Distinct from `done` (finished) — dropping records the deliberate choice to abandon, fixing the prior ambiguity between "done", "cancelled", and "deferred".

**Goal Status**:
Exactly one of `active`, `onhold`, `done`, `dropped`. It is a label on the Goal only — it never changes, hides, or cascades to the Goal's linked Tasks or Notes.
_Avoid_: paused (use `onhold`), archived, cancelled (use `dropped`).

**Closed** (Goal):
Informal grouping for Goals whose status is `done` or `dropped`; they collapse out of the main Goals overview into a "Closed" section.

**Snooze**:
Hiding an `open` Task from Today until a future date (`snoozeUntil`). A snoozed Task is still `open` — snooze is a visibility rule, never a Status.
_Avoid_: defer, hide, pause.

**Today**:
The hero view. A live query over all Tasks, not a stored page — it shows the open (un-snoozed) Tasks plus those completed today. Carry-forward is emergent: an open Task keeps appearing here until it is `done` or `dropped`. There is no daily page and no copy-forward step.
_Avoid_: daily note, daily page, inbox.

**Activity**:
A read-only retrospective lens over a single (past or present) day: the Tasks **created** and the Tasks **completed** on that local day, derived live from their timestamps. Like Today it owns no data and is not a stored page — it is the "look back" counterpart to Today's "now". Reopening a Task clears its completion, so it leaves that day's completed list (the lens reflects current timestamps, not an immutable event log).
_Avoid_: journal (implies writing — see Note), daily log page, history.

**Age**:
How long a Task has been open, measured as `today − created`. Surfaced as a subtle cue so rotting Tasks become visible.

**Priority**:
A boolean flag marking a Task as "do this now". A priority Task is highlighted and floats to the top of the active lists (Today, All Tasks, a Goal's tasks). Ordering stays derived — priority first, then soonest **due** date (undated last), then oldest **Age** — never a manual drag order.
_Avoid_: urgent (a near due date conveys that), important, star, P1/P2.

**Subtask**:
A single-level checklist item under a Task — `{ id, title, status }` with status `open` | `done`. Subtasks do not nest.
_Avoid_: child task, nested task.

**Data folder** (a.k.a. vault):
The user-chosen directory holding all Tasks, Notes, Goals, and Notebooks as individual files. Portable, git/Dropbox/iCloud-friendly. The app stores only its path, nothing else, outside it. Refer to it as "vault" or "Data folder" — not bare "folder", which now reads as a **Notebook**.
_Avoid_: database, library, store (those refer to the in-memory representation); bare "folder" (collides with Notebook).

## Relationships

- Every **Task**, **Note**, and **Goal** belongs to exactly one **Context** (`office` | `personal`).
- A **Task** links to **at most one Goal**; a **Goal** has many Tasks (computed live by matching `goalId`).
- A **Note** links to **at most one Goal**; a **Goal** has many Notes (computed live by matching `goalId`).
- A **Task** has zero or more single-level **Subtasks**.
- **Today** is a query over **Tasks** — it owns no data of its own.
- A **Goal**'s progress is `done ÷ non-dropped` over its linked **Tasks** (dropped Tasks excluded entirely, snoozed Tasks still count, Subtasks do not contribute). A Goal's own **Status** is independent of this progress — the user may mark a Goal done while leaving stragglers open.
- A **Goal**'s **Status** never cascades: closing or holding a Goal leaves its linked Tasks and Notes untouched, and they keep behaving exactly as before (open Tasks still surface in Today).

## Flagged ambiguities

- "project" → resolved to **Goal** (first-class object).
- "cancelled" / "deferred" / "done" were used inconsistently for finished-vs-abandoned → resolved into two Statuses: **done** (finished) and **dropped** (abandoned); **snooze** covers "deferred" without being a Status.
- "vault" vs "store" → **Data folder** (vault) is on disk; **store** is the in-memory copy.
