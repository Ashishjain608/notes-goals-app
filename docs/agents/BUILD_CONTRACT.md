# BUILD CONTRACT — frozen interfaces for parallel implementation

Every agent reads this file first. It freezes the shared surface so agents working
in parallel never need to coordinate. **Do not change anything in this file.** If a
frozen signature seems wrong, stop and report — do not improvise a different one.

## Ground rules (all agents)

1. **Only create/edit files under your assigned directory.** Import shared code; never edit it.
2. **Never edit** any file outside your directory, especially: `src/types.ts`, `src/lib/*`,
   `src/App.tsx`, `src/main.tsx`, `design/*`, build configs.
3. **Do not run** `npm install`, `npm run dev`, `npm run build`, `tauri dev`, or `vite`.
   (Deps are already installed.) You MAY run scoped tests for your own module only.
4. Match the surrounding code's style. Strict TypeScript is on (`noUnusedLocals`,
   `noUnusedParameters`, `noUncheckedIndexedAccess`). Keep functions small and named
   well (Clean Code). Add a short top-of-file doc comment to each module.
5. Honor the ADRs in `docs/adr/` and the glossary in `CONTEXT.md`.

## Frozen, already-implemented files (import, do not edit)

- `src/types.ts` — all domain types + IPC payloads. Authoritative.
- `src/lib/dates.ts` — `localToday`, `ageInDays`, `isSnoozed`, `isCompletedToday`,
  `dueLabel` (→ `{text,tone}`), `formatShortDate`, `toLocalDateKey`. Local-day math (ADR-0004).
- `src/lib/ipc.ts` — typed wrappers over the Rust commands. The ONLY Tauri entry point.
- `src/lib/markdown.ts` — `buildNoteExtensions()` for the TipTap note editor (ADR-0005).
- `design/tokens.css` + `design/tailwind-preset.cjs` — the visual language.

## Tailwind tokens (use these class names; never hardcode hex)

Colors: `bg`, `surface`, `surface-2`, `raise`, `ink`, `ink-2`, `ink-3`, `line`, `line-2`,
`accent`, `accent-ink`, `accent-soft`, `accent-line`, `warn-soft`, `warn-ink`
(e.g. `bg-surface`, `text-ink-2`, `border-line`, `bg-accent-soft`).
Fonts: `font-sans` (UI), `font-serif` (headlines/notes), `font-mono` (kbd).
Shadows: `shadow`, `shadow-sm`. Radii: `rounded`, `rounded-md|lg|xl`.
Animations: `animate-panelIn|fadeIn|riseIn|overlayIn`. Theme is driven by a
`data-theme="light|dark"` attribute on an ancestor (the shell sets it).

---

## A) Shared components — `src/components/` (owned by Agent C)

Presentational only. **No store imports, no IPC** — everything via props (so they are
reusable in a future web app). Port visuals from `notes-goals-claude-design/project/ui.jsx`
and `icons.jsx`, translated to TS + Tailwind tokens. Export each from `src/components/index.ts`.

Required exports and their props:

```ts
// Geometric line icon set (port every name from icons.jsx).
type IconName = "today"|"tasks"|"notes"|"goals"|"search"|"plus"|"check"|"moon"|"sun"
  |"chevron"|"chevronDown"|"clock"|"snooze"|"calendar"|"link"|"settings"|"x"|"dropped"
  |"arrowRight"|"inbox"|"dot"|"flame"|"command"|"trash";
function Icon(props: { name: IconName; size?: number; className?: string }): JSX.Element;

type AgingMode = "subtle" | "noticeable" | "escalating"; // v1 uses "noticeable"
// computeAging(task, mode) → visual cue tokens for a task's age. Put in src/components/aging.ts.
function computeAging(task: Task, mode: AgingMode): {
  n: number; label: string; colorClass: string; tintClass: string | null;
  barColorClass: string | null; barW: number;
};

function ContextDot(props: { context: Context; size?: number }): JSX.Element;
function Checkbox(props: { checked: boolean; dropped?: boolean; size?: number; celebrate?: boolean; onClick?: () => void }): JSX.Element;
function AgeTag(props: { task: Task; mode: AgingMode }): JSX.Element;
function DueChip(props: { due: IsoDate | null }): JSX.Element | null;
function SubtaskMeta(props: { subtasks: Subtask[] }): JSX.Element | null;
function ProgressBar(props: { value: number; total: number; height?: number }): JSX.Element;
function Pill(props: { active?: boolean; count?: number; onClick?: () => void; children: React.ReactNode }): JSX.Element;
// Goal is resolved by the CALLER and passed in (keeps components store-free).
function GoalChip(props: { goal: Goal | null | undefined; onOpen?: (goalId: string) => void }): JSX.Element | null;

// The canonical task row used by Today, Backlog, and the Goal page.
function TaskRow(props: {
  task: Task;
  mode: AgingMode;
  goal?: Goal | null;            // caller-resolved, for the inline GoalChip
  showContext?: boolean;
  dense?: boolean;
  onToggle?: (id: string) => void;
  onOpen?: (id: string) => void;
  onOpenGoal?: (goalId: string) => void;
  onTogglePriority?: (id: string) => void;   // present → trailing flag toggles priority
}): JSX.Element;

// Small shared bits used by multiple views:
function SectionLabel(props: { children: React.ReactNode; count?: number; accent?: boolean }): JSX.Element;
function EmptyState(props: { title: string; hint?: string }): JSX.Element;
```

Agent C may run `npx vitest run src/components` for any tests it adds (use
`// @vitest-environment jsdom` at the top of component test files).

---

## B) State store — `src/store/` (owned by Agent S)

Zustand store + pure selectors. Files: `src/store/store.ts`, `src/store/selectors.ts`,
`src/store/index.ts` (re-export). Imports `@/types`, `@/lib/ipc`, `@/lib/dates`.
Mutating actions update store state AND persist via the matching `ipc` call
(await-then-update). Theme + vault are app config, persisted by Rust/localStorage.

Frozen store hook + API:

```ts
type AppStatus = "loading" | "needs-vault" | "ready" | "error";
type Screen = "today" | "tasks" | "notes" | "goals" | "goal" | "activity";

interface AppState {
  // data
  vaultPath: string | null;
  status: AppStatus;
  errorMessage: string | null;
  tasks: Task[];
  notes: Note[];          // metadata only; bodies fetched via getNoteBody
  goals: Goal[];
  notebooks: Notebook[];  // context-scoped note containers (ADR-0008)
  // ui
  contextFilter: ContextFilter;     // "all" | "office" | "personal"
  theme: "light" | "dark";
  navCollapsed: boolean;            // false = labelled rail (default), true = icon-only; persisted
  route: { screen: Screen; goalId: string | null };
  detailTaskId: string | null;
  paletteOpen: boolean;
  selectedNoteId: string | null;
  scratchOpen: boolean;            // floating scratchpad overlay (ephemeral; text in localStorage)

  // lifecycle
  init: () => Promise<void>;                 // load config → vault → load_all; sets status
  chooseVault: () => Promise<void>;
  relocateVault: (path: string) => Promise<void>;
  reload: () => Promise<void>;               // re-run load_all (focus reload; skip if a save is pending)

  // ui actions
  setContextFilter: (c: ContextFilter) => void;
  setTheme: (t: "light" | "dark") => void;
  toggleTheme: () => void;
  toggleNav: () => void;            // collapse/expand the sidebar
  navigate: (screen: Screen, goalId?: string | null) => void;
  openTaskDetail: (id: string) => void;
  closeTaskDetail: () => void;
  openPalette: () => void;
  closePalette: () => void;
  selectNote: (id: string | null) => void;
  toggleScratch: () => void;        // open/close the floating scratchpad
  closeScratch: () => void;

  // task actions  (persist via ipc; Rust owns id/created/completed + the completed rule)
  addTask: (input: CreateTaskInput) => Promise<Task>;
  toggleTaskStatus: (id: string) => Promise<void>;       // open <-> done
  setTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  patchTask: (id: string, patch: Partial<Pick<Task,"title"|"details"|"due"|"snoozeUntil"|"goalId"|"subtasks"|"priority">>) => Promise<void>;
  toggleTaskPriority: (id: string) => Promise<void>;     // flip the priority flag
  deleteTask: (id: string) => Promise<void>;             // hard delete (→ trash)

  // note actions
  addNote: (input: CreateNoteInput) => Promise<Note>;    // input.notebookId optional
  saveNote: (note: Note, body: string) => Promise<void>; // bumps updated; reconciles notebook vs context
  getNoteBody: (id: string) => Promise<string>;          // lazy body fetch
  deleteNote: (id: string) => Promise<void>;
  moveNoteToNotebook: (id: string, notebookId: string | null) => Promise<void>; // file/unfile (ADR-0008)

  // notebook actions (ADR-0008)
  addNotebook: (input: CreateNotebookInput) => Promise<Notebook>;
  renameNotebook: (id: string, name: string) => Promise<void>;
  deleteNotebook: (id: string) => Promise<void>;         // notes survive as Unfiled (clears notebookId)

  // goal actions
  addGoal: (input: CreateGoalInput) => Promise<Goal>;
  saveGoal: (goal: Goal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;             // clears dangling links (ADR-0003)
}

const useStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AppState>>;
```

Frozen selectors in `src/store/selectors.ts` (pure functions of state slices; views call them):

```ts
// goal lookup map
function goalsById(goals: Goal[]): Record<string, Goal>;

// TODAY (ADR-0004): open + un-snoozed within filter, grouped by context, ordered
// priority-flagged → soonest-due (undated last) → oldest-created; plus tasks done
// today (tucked). Dropped-today is excluded. Backlog + goal open lists share this order.
interface TodayView {
  office: Task[]; personal: Task[]; completedToday: Task[];
  openCount: number; oldestAgeDays: number;
}
function selectToday(tasks: Task[], filter: ContextFilter, now?: Date): TodayView;

// BACKLOG: status tab + chips + title text filter.
interface BacklogFilters { status: TaskStatus | "all"; chip: "due" | "snoozed" | "goal" | null; query: string; }
function selectBacklog(tasks: Task[], filter: ContextFilter, f: BacklogFilters, now?: Date): Task[];

// GOAL progress (ADR-0002 + Q2): done ÷ non-dropped; dropped excluded; snoozed counted; subtasks ignored.
interface GoalProgress { done: number; total: number; pct: number; }
function selectGoalProgress(goalId: string, tasks: Task[]): GoalProgress;
function selectGoalTasks(goalId: string, tasks: Task[]): { open: Task[]; done: Task[] };
function selectGoalNotes(goalId: string, notes: Note[]): Note[];

// GOALS overview: active+onhold (by target asc, nulls last) and a collapsed closed[] (done+dropped).
function selectGoalsOverview(goals: Goal[], filter: ContextFilter): { live: Goal[]; closed: Goal[] };

// NOTES full-text (title + body). Body search is async-capable; for v1 filter by title
// synchronously and let the Notes view do body search via getNoteBody if needed.
function selectNotes(notes: Note[], filter: ContextFilter, query: string): Note[];

// NOTEBOOKS (ADR-0008): context-scoped containers (alphabetical) and the grouped
// notes view (filed groups + Unfiled). A note files under a notebook only when
// same-context; mismatched/dangling → Unfiled. Search matches notebook NAMES and
// note titles: a name-matched notebook surfaces all its notes; one merely
// containing title hits surfaces just those; non-matching notebooks drop out.
function selectNotebooks(notebooks: Notebook[], filter: ContextFilter): Notebook[];
interface NotebookGroup { notebook: Notebook; notes: Note[]; }
interface NotesByNotebook { groups: NotebookGroup[]; unfiled: Note[]; searching: boolean; }
function selectNotesByNotebook(notes: Note[], notebooks: Notebook[], filter: ContextFilter, query: string): NotesByNotebook;
// Pure invariant helper used by saveNote: unfile a note whose context no longer matches its notebook.
function reconcileNoteNotebook(note: Note, notebooks: Notebook[]): Note;

// ACTIVITY: a read-only day lens — tasks created and completed on a local day key
// (ADR-0004), each chronological; context filter applies. Same task may appear in both.
interface DayActivity { created: Task[]; completed: Task[]; }
function selectDayActivity(tasks: Task[], filter: ContextFilter, day: IsoDate): DayActivity;
```

Agent S may run `npx vitest run src/store` for selector tests it adds.

---

## C) Views — `src/views/<Name>/` (owned by Wave-2b agents; build AFTER A+B exist)

Each view is the entry component for one screen, importing components from
`@/components` and state/selectors from `@/store`. Each view owns ONLY its folder.
Frozen entry exports (default export from the folder's `index.tsx`):

- `src/views/Today/` → `Today` — uses `selectToday`; renders **columns** layout
  (Office | Personal side-by-side) when `contextFilter === "all"`, single column otherwise;
  serif date header + summary; completed-today tucked at bottom; embeds the inline quick-add.
- `src/views/Backlog/` → `Backlog` — status tabs + chips + title filter; uses `selectBacklog`.
- `src/views/Activity/` → `Activity` — read-only day lens (date stepper + Completed/Created
  sections); uses `selectDayActivity`. A retrospective sibling of Today, not a stored page.
- `src/views/Notes/` → `Notes` — two-pane list + TipTap editor (`buildNoteExtensions`);
  full-text search; autosave (~800ms, flush on blur/switch) via `saveNote`; delete. The
  list groups notes into collapsible **Notebook** sections + an Unfiled group with
  drag-and-drop filing (`NoteList.tsx`, ADR-0008).
- `src/views/Goals/` → `GoalsOverview` (grid + Closed section) and
  `src/views/Goals/GoalPage.tsx` → `GoalPage` — **split layout** (content + sticky sidebar
  with progress card + linked notes; live linked-task list).
- `src/views/Capture/` → `QuickAddInline`, `CommandPalette`, `TaskDetail` — inline add bar,
  ⌘K palette (add task / jump to screen), and the slide-in task detail panel
  (status segmented, due/snooze/goal rows, single-level subtasks, confirmed Delete).

The shell (`src/App.tsx`, nav rail, top chrome, vault gate, theme) is wired during
integration (owned by the orchestrator) and imports these view entries.
