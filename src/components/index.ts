/**
 * Barrel for the shared presentational component library.
 *
 * Everything here is props-in / JSX-out — no store, no IPC, no Tauri — so the
 * set is reusable in a future web app. Views import from "@/components".
 */
export { Icon } from "./Icon";
export type { IconName, IconProps } from "./Icon";

export { computeAging } from "./aging";
export type { AgingMode, Aging } from "./aging";

export { ContextDot } from "./ContextDot";
export type { ContextDotProps } from "./ContextDot";

export { Checkbox } from "./Checkbox";
export type { CheckboxProps } from "./Checkbox";

export { AgeTag } from "./AgeTag";
export type { AgeTagProps } from "./AgeTag";

export { DueChip } from "./DueChip";
export type { DueChipProps } from "./DueChip";

export { SubtaskMeta } from "./SubtaskMeta";
export type { SubtaskMetaProps } from "./SubtaskMeta";

export { ProgressBar } from "./ProgressBar";
export type { ProgressBarProps } from "./ProgressBar";

export { Pill } from "./Pill";
export type { PillProps } from "./Pill";

export { GoalChip } from "./GoalChip";
export type { GoalChipProps } from "./GoalChip";

export { TaskRow } from "./TaskRow";
export type { TaskRowProps } from "./TaskRow";

export { SectionLabel } from "./SectionLabel";
export type { SectionLabelProps } from "./SectionLabel";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
