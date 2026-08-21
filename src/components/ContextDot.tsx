/**
 * ContextDot — a tiny glyph distinguishing a task/note's context.
 *
 * Spectrum gives each context a hue: Office is a hollow indigo square
 * (`--ctx-office`); Personal is a filled emerald circle (`--ctx-personal`). The
 * shape difference keeps the two readable without relying on color alone.
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
        className="inline-block flex-shrink-0 rounded-sm border-[1.5px] border-ctx-office"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title="Personal"
      className="inline-block flex-shrink-0 rounded-full bg-ctx-personal"
      style={{ width: size, height: size }}
    />
  );
}
