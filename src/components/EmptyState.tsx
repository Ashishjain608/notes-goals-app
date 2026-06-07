/**
 * EmptyState — a quiet, centered placeholder for empty lists/views.
 *
 * A serif title (matching the app's editorial voice) over an optional muted hint.
 */
import type { JSX } from "react";

export interface EmptyStateProps {
  title: string;
  hint?: string;
}

/** Render a centered empty-state message. */
export function EmptyState({ title, hint }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="font-serif text-base text-ink-2">{title}</div>
      {hint && <div className="mt-1.5 text-sm text-ink-3">{hint}</div>}
    </div>
  );
}
