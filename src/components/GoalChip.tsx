/**
 * GoalChip — an inline, clickable link to a task's goal.
 *
 * The goal is resolved by the CALLER and passed in (no store lookup), keeping
 * this component reusable. Renders nothing when no goal is provided. Clicking
 * stops propagation so it never opens the surrounding task row.
 */
import type { JSX } from "react";
import type { Goal } from "@/types";
import { Icon } from "./Icon";

export interface GoalChipProps {
  goal: Goal | null | undefined;
  onOpen?: (goalId: string) => void;
}

/** Render the goal chip, or null when no goal is resolved. */
export function GoalChip({ goal, onOpen }: GoalChipProps): JSX.Element | null {
  if (!goal) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(goal.id);
      }}
      className="inline-flex max-w-[180px] items-center gap-1 rounded-sm px-1 py-px text-xs text-ink-2 transition-colors duration-150 hover:bg-accent-soft hover:text-accent-ink"
    >
      <Icon name="goals" size={12} />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">{goal.title}</span>
    </button>
  );
}
