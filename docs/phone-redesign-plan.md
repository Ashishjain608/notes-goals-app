# Phone redesign ("Final 2"): implementation plan

Scope: the phone layout only, meaning the web build below 768 px running as an iPhone Home Screen app. The Mac app must render exactly as it does today. Decisions are recorded in [ADR-0012](adr/0012-phone-shell-bottom-anchored.md). Measurements, tokens and dark values are in [design/phone-final2-spec.md](design/phone-final2-spec.md). The visual source of truth is the "Final (B × C)" page of the design canvas (Final 2 row; the Task sheet, Notes, Editor, Goals and Search screens come from the Final 1 row).

## The simple picture

```
┌─────────────────────────────┐
│ Title (serif)        (ctx)  │  ← header scrolls with the page; ctx avatar opens the "More" sheet
│ …page content…              │
│                             │
│                       [＋]  │  ← FAB: Task · Note · Checklist · Goal menu → composer
│ ( Today Tasks Notes Goals )(⌕)│  ← floating glass tab bar + search button
└─────────────────────────────┘
 composer / search / sheets / format pill rise above the keyboard (visualViewport)
```

All phone UI is split into three layers:

1. **Shell:** `src/shell/phone/`. It holds the tab bar, search, FAB and menu, composer, More sheet and undo toast. These components wire into the store.
2. **Phone views:** `src/views/*/Phone*.tsx`. One component per screen, chosen at the view root with `useIsPhone()`.
3. **Pure logic:** `src/lib/` and `src/store/`. This covers the capture parser, keyboard-inset math, the history stack, undo, and the new selectors. All of it is node-testable, because vitest runs without jsdom and new npm packages are not allowed.

## Ground rules (from the code map)

- **Desktop stays the same.** Branch at the view root. Never edit desktop class strings. A shared component changes only through a new prop whose default reproduces today's markup, or through a `max-md:` class. There are `renderToStaticMarkup` tests that pin desktop markup for `TaskRow`, `Checkbox` and `QuickAddInline` before they are touched.
- **Store-free components.** Presentational pieces (BottomSheet, Chip, SegmentedControl, SlotMeter, ActionTile, ProgressBar) live in `src/components/` and take props. Store wiring lives in `src/shell/phone/` and `src/views/`.
- **Storage goes through `ipc` only.** No new `ipc` function is planned. If one becomes necessary, it must be added to both `tauri.ts` and `web.ts`, plus the fixtures (ADR-0006, ADR-0011).
- **No new dependencies.** Use CSS transitions, pointer events, `visualViewport` and native `<input type="date">`.
- **Glossary terms in the UI copy.** Use slate, commit, snooze, drop, notebook, file, "data folder", following CONTEXT.md.
- **Overlay z-ladder.** It runs: tab bar 30 < FAB 32 < TaskDetail 41 < note drawer 45 < phone sheets/composer/search 50 < toast 55 < z-60 dialogs (Settings, WhatsNew).

## Decisions taken as defaults (say if you want them changed)

| # | Question | Default in this plan |
|---|---|---|
| D1 | Pinned notes need a new `pinned` field on Note, which is a vault-format change | Phase 6: a real synced field with `serde(default)`. Until then Notes shows only "Recent". |
| D2 | Should snoozing a task that's on today's slate remove it from the slate? Today it keeps its slot while hidden. | Yes, everywhere (a domain fix, tiny): `patchTask` with `snoozeUntil` also clears `committedOn` when it's today's. It ships in Phase 0 with a test. |
| D3 | Attaching files from the phone | Out of scope (ADR-0011). No attach button on the phone. |
| D4 | What "Checklist" in the add menu creates | A Note whose body starts `- [ ] ` (TaskList is already loaded). Composer opens in Note mode with a checklist line. |
| D5 | Swipe actions on task rows | Deferred to Phase 7, optional. The design has none. Every action is reachable by tap. |
| D6 | Undo for delete | Not in this redesign. Delete keeps `confirmDestructive`. Undo covers complete, drop, commit, uncommit and snooze. |

## Phases

Each phase is one PR. It is merged only when the phone app is complete and working at that phase, because merging to `main` deploys the phone app (Pages). Each PR must pass the gates (below) plus a phone screenshot pass in light and dark.

### Phase 0: Foundations (no visible change)

| Piece | Where | Notes |
|---|---|---|
| Glass / scrim / tint tokens | `design/tokens.css`, `design/tailwind-preset.cjs` | `--glass`, `--glass-line`, `--glass-strong` (sheet .94), `--scrim`, `--ctx-personal-soft`, `--ink-6`, `--meter-empty`, light and dark (values in the spec §5). Unused variables don't affect desktop. |
| `useKeyboardInset()` | `src/lib/keyboard.ts` (+ `keyboard.test.ts` for the pure `insetFrom(innerHeight, vv)` math) | Listens to `visualViewport` resize and scroll. Returns the px the keyboard covers. Includes the iOS standalone "viewport stays shrunk after blur" re-measure workaround. |
| Phone history stack | `src/lib/phoneHistory.ts` (+ test of the pure stack) | `pushLayer(id, close)`, `popLayer(id)`, with a single `popstate` listener. Phone only. Must not disturb `sync/index.ts`'s OAuth `replaceState`. |
| Undo slice | `src/store/undo.ts`, merged into the store | `showUndo({ label, undo })` keeps a single pending toast with a 6 s timer. A new toast replaces the old one. The test fakes timers. |
| Store options | `src/store/store.ts` | `addTask(input, { openDetail = true })`. `TaskPatch` gains `context`. Snooze clears today's commit (D2). The existing test `taskMutation.test.ts:150` must still pass. |
| New selectors | `src/store/selectors.ts` (+ tests) | `selectBacklogByGoal`, `selectGoalNext` (skips snoozed tasks), `selectGoalSections` (Active / On hold), `selectRecentNotes`. |
| Theme-colour meta | `applyTheme` in `store.ts` | Updates `<meta name="theme-color">` and the status-bar style on toggle. It has to be bundled JS, because the CSP blocks inline scripts. |
| BottomSheet primitive | `src/components/BottomSheet.tsx` | Grabber, visible Done/Close, scrim tap. Uses `useSlidePanel`-style mount/unmount and `prefers-reduced-motion`. Only one sheet at a time. |

**Exit check:** all gates pass and the desktop screenshots are pixel-identical to `main` (`handoff/tools/screens.mjs`, before and after).

### Phase 1: Shell (tab bar, search, FAB menu, More sheet)

- `App.tsx`: on the phone, render `<PhoneShell/>` instead of `TitleBar` + `BottomBar`. Delete `BottomBar`/MoreSheet once nothing imports them.
- `src/shell/phone/PhoneShell.tsx` mounts `GlassTabBar`, `SearchButton`, `Fab`, `FabMenu`, `MoreSheet` and `UndoToast`, and supplies the `--phone-chrome` bottom padding each view uses (spec: at least 176 px plus the safe area).
- **Search:** `SearchOverlay.tsx`. The search button grows into a bottom field pinned at `useKeyboardInset()`. Results sit above it, anchored to the bottom and grouped Tasks / Notes / Goals. It reuses the pure `searchAll` from `src/lib/search.ts` and the palette's debounced body search, lifted into a hook `useNoteBodyHits`. The desktop CommandPalette is untouched. On the phone, `openPalette` routes to the overlay.
- **FAB menu:** FAB → scrim + 4 labelled pills (Task nearest the thumb). In Phase 1 the menu items call the existing flows: Note means `addNote` + `selectNote`, Goal opens the existing `NewGoalDialog`, and Task focuses the composer stub. Phase 2 replaces these.
- **More sheet** (from the context avatar in each header): the All / Office / Personal filter, Activity, Settings, Light/Dark, and the sync status as plain text ("Synced 2 min ago" plus a "Sync now" button). This fixes audit #12.
- Every overlay registers with `phoneHistory`, so swipe-back closes it.

**Exit check:** every existing screen is still reachable within 2 taps, and swipe-back closes overlays on a real iPhone.

### Phase 2: Composer + natural-language capture

- `src/lib/parseCapture.ts` is pure, with `now` and goals injected:
  - **Dates:** today, tomorrow, weekdays, "next week", "in N days", "Oct 9" and "9 Oct", built on `dates.ts` and `dueDates.ts`.
  - **Context:** `#office` and `#personal`.
  - **Goal:** `#<goal words>`, matched as a prefix against active goal titles.
  - **Output:** `{ title, due?, context?, goalId?, tokens[] }`, where `tokens` carries the ranges for highlighting.
  - **Tests:** a table test, DST-safe, alongside the existing `dates.test.ts`.
- `src/shell/phone/Composer.tsx`:
  - Three modes: Task | Note | Goal, plus Checklist as Note with a checklist body (D4).
  - The card is pinned above the keyboard, and the inline tokens render as `ParsedChip`s. Chips can be removed, and tapping one opens its picker sheet.
  - Task mode: an "Add to slate · n of cap" toggle (disabled when the slate is full, with a reason line). Save runs `addTask(…, { openDetail: false })`, then `toggleTaskCommit` if the toggle is on.
  - Note mode: title and first line, plus Notebook / Context / Goal chips. Save runs `addNote`, and "Open full editor" goes to the editor.
  - Goal mode: title, context and target date via `addGoal`.
  - After saving, the composer stays open for rapid entry. Tapping the scrim or swiping back closes it.
- The pickers are a shared `PickerSheet`: a list of options with search, used by Goal, Notebook and Context. Dates use presets (Today, Tomorrow, Next week) plus a native `<input type="date">`, replacing the 28 px DatePicker cells on the phone.

**Exit check:** typing "Renew passport tomorrow #personal" and pressing Save gives a Personal task due tomorrow with no detail panel, in 2 taps from Today.

### Phase 3: Today, Tasks, Task sheet

- `src/views/Today/PhoneToday.tsx`: header with serif date and context avatar, `SlotMeter` (`selectSlate`), `SlateCard`s for the committed tasks, and "Available" compact rows grouped Office / Personal, with Completed collapsed. It uses `selectToday` unchanged.
- `src/views/Backlog/PhoneTasks.tsx`: segmented Open / Done / Dropped, a horizontal `ChipStrip` (Due soon, Snoozed, Linked to goal, Office, Personal), and rows grouped by goal using `selectBacklogByGoal`. Each row has a 44 px `SlateToggle`, which fixes the tiny dimmed commit icon. A rejected commit while the slate is full shows a toast: "Slate is full (5 of 5)".
- `src/components/TaskRowCompact.tsx` (store-free). The checkbox is the existing `Checkbox` (46 px hit area). Title on one line, one meta line.
- `src/shell/phone/TaskSheet.tsx`:
  - Replaces `TaskDetail` on the phone; desktop keeps `TaskDetail`. It renders when `detailTaskId` is set and the device is a phone.
  - Content: a checkbox title, then 4 `ActionTile`s (Commit, Snooze, Due, Goal), then Subtasks, Notes, Context (now editable through the `TaskPatch.context` from Phase 0), and Drop / Delete at the bottom.
  - Code reuse: `Subtasks` and `GrowTextarea` move out of `TaskDetail.tsx` into exported modules. This is a mechanical move, and desktop output does not change.
- **Undo wiring:** complete, drop, commit, uncommit and snooze call `showUndo` with the previous value.

**Exit check:**
- Finish, commit, snooze and undo work one-handed on a 390 px screen.
- The slate count matches desktop for the same data.

### Phase 4: Notes + editor

- `src/views/Notes/PhoneNotes.tsx`:
  - Serif title and a `NotebookShelf` (counts from `selectNotesByNotebook`; Unfiled is outlined).
  - `NoteCard`s with a 2-line serif preview from `excerptFromMarkdown`.
  - Tapping a shelf card filters the list.
  - The desktop DnD code in `NoteList.tsx` is left untouched.
- **Editor on the phone (shared `NoteEditor`, phone props):**
  - The tab bar and FAB are hidden while editing.
  - A single **filing chip** ("Product · Q3 board deck · Office") opens `FilingSheet`. It sets the context first and filters notebooks and goals to that context, because reconcile clears mismatches.
  - Every write in `FilingSheet` goes through the editor's `saveWith(patch)` (or `flush()` first). This avoids the autosave race in which a pending 800 ms save writes back the old notebook or goal.
  - **`FormatPill`** above the keyboard: Aa (H1/H2/body), B, I, bullets, checklist, link, ⌄ hide keyboard.
    - It reuses the TipTap chain commands from `EditorToolbar.tsx`.
    - Buttons use `onPointerDown={e => e.preventDefault()}`, so a tap doesn't blur the editor and drop the keyboard.
    - The link popover rises with the pill.
  - The scroller gets bottom padding equal to the pill height plus the keyboard inset, and ProseMirror `scrollMargin`, so the caret never hides under the keyboard.
  - `NoteEditorDrawer`, which opens a note from a goal page, gets the same treatment.

**Exit check:**
- A note can be created, written, formatted, filed into a notebook and linked to a goal without leaving the editor, on a real iPhone.
- Refiling while typing never loses the new notebook.

### Phase 5: Goals

- `src/views/Goals/PhoneGoals.tsx`: Active / On hold sections (`selectGoalSections`). `GoalRow`s show the title, "Next: …" (`selectGoalNext`), a 4 px progress bar with "4/7", and the target date. Closed goals collapse.
- Goal page on the phone: the existing `GoalPage` with phone polish. The back button is registered with `phoneHistory`. The status menu becomes a `PickerSheet`. "Add task to this goal" uses the composer with the goal chip filled in.
- New goal comes only from the composer's Goal mode. `NewGoalDialog` stays for desktop.

### Phase 6: Pinned notes (D1)

- Add `pinned` to the Note model in Rust (`#[serde(default)]`), `types.ts`, `vaultFormat.ts` (write and parse), `web.ts createNote`, and sync. Regenerate both fixture sets with `UPDATE_FIXTURES=1`.
- The phone gets "Pinned" above "Recent" and a Pin toggle in the editor's ⋯ menu. Desktop shows nothing new unless asked.

### Phase 7: Polish and optional extras

- **Dark mode:** a pass through every phone screen. Use the dark tokens; the accent FAB icon becomes an ink icon on `#818cf8` for contrast. Amber text at 13 px needs a contrast check (about 3.2:1 on white). Use 600 weight or `--warn-ink` on a tint.
- **Motion:** FAB → menu (stagger 30 ms, 180 ms), menu → composer, sheet rise (240 ms), check-off, toast slide. All of it falls back under reduced motion.
- **Optional:** swipe right on a row to finish, swipe left to snooze until tomorrow. Pointer events only, the start must be more than 24 px from the left edge, and the TaskSheet stays the visible alternative.
- Release: bump the SW `CACHE` only if `sw.js`, icons or the manifest change, then a CHANGELOG entry.

## Verification (each phase)

1. **Gates:** `npm run typecheck && npm test && cargo test --manifest-path src-tauri/Cargo.toml && npm run build:web`.
2. **Desktop unchanged:** run `handoff/tools/screens.mjs` on `main` and on the branch, then diff the PNGs. Any pixel difference blocks merge.
3. **Phone render:** CDP mobile emulation at 390×844 (the `phone.mjs`/`measure.mjs` harness from the audit, to be moved into `handoff/tools/`). Shots of every phone screen in light and dark, and a target-size report where everything interactive is at least 44 px.
4. **Real iPhone checklist** (headless Chrome can't do these):
   - The keyboard rises and the composer, search field and format pill sit right above it, including after rotating and after dismissing the keyboard.
   - Swipe-back closes the top overlay and never leaves the app.
   - Glass bars scroll smoothly over a long list.
   - Caret stays visible while typing at the bottom of a long note.
   - Tapping toolbar buttons keeps the keyboard up.
   - Dropbox sync still runs after these changes.

## Risks

| Risk | Mitigation |
|---|---|
| The iOS standalone keyboard/viewport bug (the viewport stays shrunk after the keyboard closes) | Re-measure on `focusout`. Phase 0 hook plus a device check. |
| `backdrop-filter` jank or a blank scroller | Glass only on fixed chrome, never inside `.scroll`. A solid-fill fallback token. |
| TipTap/iOS: caret jumps, double backspace, IME composition | No non-editable inline widgets. Keep `scrollMargin`. The device checklist covers it. |
| Editor autosave overwriting filing changes | `saveWith`/`flush` before `moveNoteToNotebook` (Phase 4). |
| `addTask` opening the detail panel | The `openDetail` option (Phase 0) keeps the existing test intact. |
| Every merge deploys to the phone | Merge only complete phases, with the phone screenshot pass done first. |
