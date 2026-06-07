/**
 * Capture surfaces — the task creation and editing UI.
 *
 * Three store-connected components: the always-visible inline quick-add bar,
 * the ⌘K command palette (add task / jump to screen), and the slide-in
 * task-detail panel. Each reads the slices it needs from `@/store` and persists
 * through store actions; the shell mounts the palette and detail panel once at
 * the app root, while views embed `QuickAddInline` under their headers.
 */
export { QuickAddInline } from "./QuickAddInline";
export { CommandPalette } from "./CommandPalette";
export { TaskDetail } from "./TaskDetail";
