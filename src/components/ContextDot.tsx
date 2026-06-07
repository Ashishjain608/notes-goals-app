/**
 * ContextDot — a tiny glyph distinguishing a task/note's context.
 *
 * Office is a hollow rounded square (neutral ink); Personal is a filled accent
 * circle. The shape difference keeps the two readable without relying on color.
 */
import type { JSX } from "react";
import type { Context } from "@/types";

export interface ContextDotProps {
  context: Context;
  /** Pixel size of the dot. Defaults to 7. */
  size?: number;
}

/** Render the context glyph for the given context. */
export function ContextDot({ context, size = 7 }: ContextDotProps): JSX.Element {
  if (context === "office") {
    return (
      <span
        title="Office"
        className="inline-block flex-shrink-0 rounded-sm border-[1.5px] border-ink-3"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title="Personal"
      className="inline-block flex-shrink-0 rounded-full bg-accent"
      style={{ width: size, height: size }}
    />
  );
}
