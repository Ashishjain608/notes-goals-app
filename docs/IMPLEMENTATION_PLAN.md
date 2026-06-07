# Notes & Goals — Implementation Plan

A calm, local-first, single-user macOS app unifying daily **Tasks**, **Notes**, and longer-term **Goals**, stored as plain inspectable files in a user-chosen folder. Domain language: [`CONTEXT.md`](../CONTEXT.md). Locked decisions: [`docs/adr/`](./adr/).

> **The core principle (drives everything):** the **Task** is the source of truth, not a daily page. **Today** is a live query over all tasks. Carry-forward is *emergent* — an open task keeps appearing until it is `done` or `dropped`. There is no copy-forward step and no migration job, ever.

---

## 1. Tech stack (locked)

| Layer | Choice |
|------|--------|
| Shell | Tauri 2.x → native macOS `.app` |
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind via a **reusable preset** + CSS-variable token layer (ADR-0007) |
| Editor | TipTap (ProseMirror) WYSIWYG + `tiptap-markdown` (GFM) (ADR-0005) |
| State | Zustand — one store mirroring the loaded entity graph |
| Backend | Rust commands own **all** filesystem I/O (ADR-0006) |
| Tests | Rust `cargo test`; frontend Vitest |

No code signing / notarization / distribution work (personal use). Prereqs: Rust toolchain + Node — documented in README.

---

## 2. Repository structure

```
notes-goals-app/
├── design/                     # framework-agnostic, reusable in a future web app (ADR-0007)
│   ├── tailwind-preset.cjs     #   semantic scale; colors → var(--token)
│   └── tokens.css              #   :root / [data-theme] values + accents (verbatim from prototype)
├── src/                        # React frontend
│   ├── main.tsx, App.tsx
│   ├── store/                  # Zustand store + selectors (the live "queries")
│   │   ├── store.ts
│   │   └── selectors.ts        # todayQuery, backlogQuery, goalProgress, notesSearch, …
│   ├── lib/
│   │   ├── ipc.ts              # typed wrappers over Tauri invoke()
│   │   ├── dates.ts            # local-day math (ADR-0004) — pure, injectable `now`
│   │   └── markdown.ts         # TipTap ⇄ GFM helpers
│   ├── types.ts                # Task / Note / Goal / Subtask (shared shapes)
│   ├── views/                  # Today, Backlog, Notes, GoalsOverview, GoalPage
│   ├── components/             # TaskRow, Checkbox, QuickAddInline, CommandPalette,
│   │                           #   TaskDetail, NavRail, ThemeToggle, ContextFilter, …
│   └── styles/index.css        # imports design/tokens.css + tailwind layers
├── src-tauri/                  # Rust
│   ├── src/
│   │   ├── lib.rs / main.rs    # command registration
│   │   ├── commands.rs         # vault, load_all, create/update/delete_*
│   │   ├── store_io.rs         # parse/serialize, atomic write, trash, link resolution
│   │   └── model.rs            # serde structs mirroring types.ts
│   └── tauri.conf.json
├── CONTEXT.md, docs/adr/, docs/IMPLEMENTATION_PLAN.md
└── README.md
```

---

## 3. Data model (final)

```ts
type Context = 'office' | 'personal';
type TaskStatus = 'open' | 'done' | 'dropped';
type SubStatus  = 'open' | 'done';
type GoalStatus = 'active' | 'onhold' | 'done' | 'dropped';

interface Subtask { id: string; title: string; status: SubStatus }   // single-level only (ADR-0001)

interface Task {
  id: string;                 // uuid, Rust-generated
  title: string;
  context: Context;
  status: TaskStatus;
  created: string;            // UTC datetime, ISO-8601 'Z' (immutable)
  due: string | null;         // 'YYYY-MM-DD'
  snoozeUntil: string | null; // 'YYYY-MM-DD'
  completed: string | null;   // UTC datetime; auto-set on →done, cleared on reopen (Rust)
  goalId: string | null;      // ≤ 1 goal
  subtasks: Subtask[];
}                             // no `order` field — sorting is derived

interface Note {
  id: string; title: string; context: Context; goalId: string | null;
  created: string; updated: string;   // UTC datetimes
  // body NOT in JSON — see file format
}

interface Goal {
  id: string; title: string; description: string;  // description is markdown
  context: Context; status: GoalStatus;
  target: string | null;     // 'YYYY-MM-DD'
  created: string; updated: string;
}                            // never stores its task/note lists — computed live
```

`dates` rules (ADR-0004): datetimes stored UTC `Z`; calendar dates bare `YYYY-MM-DD`; **all day-boundary math in local time**.

---

## 4. Storage layer (the heart)

**Folder layout in the vault:**
```
<vault>/tasks/<uuid>.json     # pretty JSON, 2-space
<vault>/notes/<uuid>.md       # YAML frontmatter + markdown body
<vault>/goals/<uuid>.json
<vault>/.atlas/               # app-internal: trash/, (optional cache)
<vault>/.atlas/trash/         # hard-deleted files land here, never unlinked (ADR-0003)
```

**Note file format** (frontmatter Obsidian-compatible, title in frontmatter only — never duplicated as H1):
```md
---
id: <uuid>
title: RTSP frame validation findings
context: office
goalId: <uuid-or-empty>
created: 2026-06-03T09:12:00Z
updated: 2026-06-04T11:00:00Z
---
Body in **markdown** here.
```

**Write safety:** every write is atomic — `<file>.tmp` → fsync → rename over target. Never write in place.

**Load:** `load_all()` reads all three folders, parses, resolves `goalId` links, treats any `goalId` with no matching goal as *unlinked* (never crashes — ADR-0003), returns one typed graph.

**Deletion (ADR-0003):** `dropped` is the everyday soft removal for Tasks/Goals (stays in backlog). Hard delete is a separate **confirmed** action — the only removal path for Notes — and moves the file to `.atlas/trash/`. Deleting a Goal also rewrites its linked Tasks/Notes to `goalId: null`.

---

## 5. Rust command surface

```
get_vault_path() -> string | null              # from appConfigDir/config.json
choose_vault()   -> string | null              # native dialog → validate → create subfolders → persist
relocate_vault(path) -> ()                      # switch vault (settings)
load_all() -> { tasks: Task[], notes: NoteMeta[], goals: Goal[] }
load_note_body(id) -> string                    # markdown body (lazy; meta comes from load_all)

create_task(input) -> Task                      # generates id + created
update_task(task)  -> Task                      # applies completed rule on status transition
delete_task(id)    -> ()                         # → trash

create_note(input) -> Note
update_note(note, body) -> Note                 # bumps updated, never created
delete_note(id)    -> ()                         # → trash

create_goal(input) -> Goal
update_goal(goal)  -> Goal                       # bumps updated
delete_goal(id)    -> { clearedTaskIds, clearedNoteIds }   # → trash + clear dangling links
```

Rust is a **stateless serializer**; disk is the source of truth; identity (`id`) and clock values (`created`, `completed`) are Rust-authoritative (ADR-0006). Local writes are sub-ms → await-then-update, no optimistic UI.

---

## 6. In-memory store & the live queries (Zustand)

State: `vaultPath, tasks[], notes[], goals[], context('all'|'office'|'personal'), theme, route, ui(detailTaskId, paletteOpen, selectedNoteId), loading`.

Every view is a **pure selector** — this is where "Today is a live lens" lives:

- **`todayQuery`** → open tasks where `snoozeUntil == null || snoozeUntil <= localToday`, grouped by context, sorted oldest-`created` first; **plus** tasks `done` with `completed` on localToday (tucked at bottom). Dropped-today does **not** appear (ADR-0004).
- **`goalProgress(goalId)`** → `done ÷ non-dropped` linked tasks; dropped excluded, snoozed counted, subtasks ignored; `0/0` → empty state. Goal status independent of this (ADR-0002).
- **`goalTasks(goalId)` / `goalNotes(goalId)`** → live filter by `goalId`.
- **`backlogQuery(filters)`** → status tab + due/snoozed/goal chips + title text filter.
- **`notesSearch(q)`** → case-insensitive substring over title + body.
- **`age(task)`** → `localToday − localDate(created)` in whole days.

Mutations update the store **and** call the matching Rust command. `load_all()` runs on launch and (guarded) on window focus; the guard skips reload while an edit is mid-autosave (no live watcher in v1 — fast-follow).

---

## 7. Views (chosen variants only — others & the Tweaks panel are dropped)

Selected variants: **rail nav · columns Today · inline quick-add (+ ⌘K) · split goal page · "noticeable" aging.** Light/dark is a real persisted setting; accent = terracotta (token-swappable).

- **Today (hero, build first):** serif date headline + summary ("N open · oldest waited Xd · M done today"); ever-present inline quick-add; **columns layout** (Office | Personal side-by-side) when Context = All, single column when a context is filtered; aging cues per "noticeable" mode; completed-today collapsed at bottom.
- **Quick-add (inline) + ⌘K palette:** inline bar always visible on Today; ⌘K opens the command palette (add task / jump to section).
- **Task detail panel:** slide-in; edit title, context, status (Open/Done/Dropped segmented), due, snooze, goal link, single-level subtasks; secondary confirmed **Delete**.
- **Goals overview:** card grid with live progress; active+onhold shown, **done+dropped collapsed into a "Closed" section**; sorted by `target` asc (no-target last); context filter applies.
- **Goal page (split):** title/description + sticky sidebar (progress card + linked notes) + live linked-task list; always lists tasks/notes regardless of goal status.
- **Notes:** two-pane list + WYSIWYG editor; full-text search over title+body; autosave (~800ms, flush on blur/nav/quit); **Delete** (only removal path).
- **Backlog / All Tasks:** status tabs (Open/Done/Dropped/All) + due/snoozed/goal chips + title text filter; oldest-`created` first.

---

## 8. Design system

Per ADR-0007: `design/tailwind-preset.cjs` (semantic colors → `var(--token)`, fonts, shadows, radii) + `design/tokens.css` (`:root`/`[data-theme]` values + accents, copied verbatim from the prototype for pixel parity). The app imports both; `[data-theme]` toggles light/dark at runtime; the preset is reusable by a future web app. Geometric line icons ported from `icons.jsx`.

---

## 9. Build phases (follows brief §9)

1. **Scaffold** — Tauri 2 + React/TS/Vite + Tailwind preset + `tokens.css`; Rust command skeleton; type definitions shared in spirit between `types.ts` and `model.rs`.
2. **Storage + I/O first** — folder layout, atomic writes, `load_all`, parse/serialize, dangling-link resolution, trash. **Prove read/write round-trips with Rust tests before any UI.** Wire Zustand + `load_all` on launch.
3. **Today** — build the columns Today against the store to validate the core principle end-to-end (add a task → it persists → appears → survives reload → ages).
4. **Quick-add + Task detail** — inline add, ⌘K palette, detail panel with status/due/snooze/goal/subtasks, completed-rule via Rust.
5. **Goals** — overview (with Closed section) + split goal page; live progress/links.
6. **Notes** — TipTap + `tiptap-markdown`, frontmatter I/O, autosave, search.
7. **Backlog** — filters + title search.
8. **Polish** — theme toggle + persistence, empty/error states, vault relocate/welcome flow, focus-reload guard, delete confirmations + trash.
9. **Ship locally** — README (prereqs, run, `npm run tauri build`).

---

## 10. Testing strategy

- **Rust:** round-trip serialization (Task/Note/Goal incl. frontmatter), atomic-write correctness, dangling-`goalId` resolution, goal-delete link-clearing, trash behavior.
- **Frontend (Vitest):** pure selectors with an **injectable `now`** — `todayQuery`, `goalProgress`, `age`, snooze/due boundaries, and the late-night-completion local-day case (ADR-0004). Markdown round-trip snapshot tests for the supported feature set (ADR-0005).
- **Manual QA:** dogfood the chosen flows against the prototype for pixel parity.

---

## 11. Out of scope (v1) & fast-follows

**Out:** cloud/sync/accounts/sharing, reminders/notifications, recurring tasks, calendar view, tags beyond `context`, code signing/notarization, global cross-entity search, drag-reorder, images/tables/embeds in notes, multi-window.

**Fast-follows (designed-for, not built):** Rust `notify` file-watcher with granular reconciliation; native reminders/notifications; accent picker; global ⌘K search; recursive subtasks; trash auto-empty.

---

## 12. Key risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Markdown round-trip drift / noisy diffs | Pin to supported feature set; snapshot tests; accept the documented fidelity ceiling (ADR-0005) |
| Timezone / local-day bugs | All day-math in pure `dates.ts` with injectable `now`; explicit late-night test (ADR-0004) |
| Focus-reload clobbering in-flight edits | Dirty-guard skips reload while autosave pending |
| Data loss on delete | Trash-not-unlink; atomic writes (ADR-0003/0006) |
| Scope creep back toward "everything app" | ADRs + CONTEXT.md as the guardrail; §11 is explicit |
```
