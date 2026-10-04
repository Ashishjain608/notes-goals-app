import { useState, type JSX } from "react";
import type { Subtask } from "@/types";
import { useIsPhone } from "@/lib/platform";
import { Checkbox, Icon } from "@/components";

/** The subtasks section: progress count, toggleable items, and an add input. */
export function Subtasks({
  subtasks,
  onToggle,
  onAdd,
  label = true,
}: {
  subtasks: Subtask[];
  onToggle: (id: string) => void;
  onAdd: (title: string) => void;
  /** The caller may draw its own heading (the phone TaskSheet does). */
  label?: boolean;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const phone = useIsPhone();
  const doneCount = subtasks.filter((s) => s.status === "done").length;

  const commit = (): void => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft("");
  };

  return (
    <div className="px-3">
      {label && (
        <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.07em] text-ink-3">
          Subtasks
          {subtasks.length > 0 && (
            <span className="text-ink-3">
              {" "}
              · {doneCount}/{subtasks.length}
            </span>
          )}
        </div>
      )}
      {subtasks.map((s) => {
        const done = s.status === "done";
        return (
          <div
            key={s.id}
            // On a phone the whole 44px row toggles; the 16px box alone is too small to hit.
            onClick={phone ? () => onToggle(s.id) : undefined}
            className="flex items-center gap-2.5 py-[5px] max-md:min-h-[44px]"
          >
            <Checkbox checked={done} size={16} onClick={() => onToggle(s.id)} />
            <span
              className={`text-[13.5px] ${
                done ? "text-ink-3 line-through decoration-ink-3" : "text-ink"
              }`}
            >
              {s.title}
            </span>
          </div>
        );
      })}
      <div className="mt-0.5 flex items-center gap-2.5 py-[5px]">
        <span className="text-ink-3">
          <Icon name="plus" size={16} />
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          placeholder="Add subtask"
          className="flex-1 border-none bg-transparent text-[13.5px] max-md:h-11 max-md:text-[16px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>
    </div>
  );
}
