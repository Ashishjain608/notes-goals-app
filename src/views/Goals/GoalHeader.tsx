/**
 * GoalHeader — the editable title/description/meta block atop the Goal page.
 *
 * Bundles everything about a goal that is now editable in place: the serif
 * title and description (auto-growing borderless textareas saved on blur,
 * mirroring TaskDetail's title pattern), the status pill (a small menu over
 * the four `GoalStatus` values), and the target date (the shared `DateField`,
 * plus a clear affordance). Every edit calls `onSave` with just the changed
 * field — the caller (`GoalPage`) spreads it onto the existing goal and passes
 * the whole thing to the store's `saveGoal`, so `id`/`created`/`updated` are
 * never fabricated here (ADR-0006). Changing status never touches the goal's
 * linked tasks or notes (ADR-0002) — it is a single field on this object.
 */
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from "react";
import type { Goal, GoalStatus, IsoDate } from "@/types";
import { ContextDot, DateField, Icon } from "@/components";

export interface GoalHeaderProps {
  goal: Goal;
  onSave: (patch: Partial<Goal>) => void;
}

const STATUS_VALUES: readonly GoalStatus[] = ["active", "onhold", "done", "dropped"];

/** Human label for a GoalStatus value (only "onhold" needs reshaping). */
export function statusLabel(status: GoalStatus): string {
  return status === "onhold" ? "On hold" : status[0]!.toUpperCase() + status.slice(1);
}

/** Fall back to `previous` for a blank/whitespace-only edit — a goal must never persist a blank title. */
export function resolveTitle(previous: string, next: string): string {
  const trimmed = next.trim();
  return trimmed || previous;
}

/**
 * An auto-growing, borderless textarea saved on blur. Uncontrolled (seeded
 * from `defaultValue`, re-measured when `fieldKey` changes); `onBlur` may
 * return a corrected value (e.g. the empty-title fallback), which is written
 * back into the field so the display never disagrees with what was saved.
 */
function GrowField({
  fieldKey,
  defaultValue,
  onBlur,
  placeholder,
  className,
}: {
  fieldKey: string;
  defaultValue: string;
  onBlur: (value: string) => string | void;
  placeholder?: string;
  className: string;
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = (): void => {
    const el = ref.current;
    if (!el) return;
    // Collapsing to "auto" before reading scrollHeight briefly shrinks the
    // page, which clamps the `.scroll` ancestor's scrollTop — restore it
    // synchronously around the collapse so the user never sees a jump.
    const scroller = el.closest<HTMLElement>(".scroll");
    const scrollTop = scroller?.scrollTop;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (scroller && scrollTop !== undefined) scroller.scrollTop = scrollTop;
  };

  useLayoutEffect(fit, [fieldKey]);

  return (
    <textarea
      key={fieldKey}
      ref={ref}
      defaultValue={defaultValue}
      onInput={fit}
      onBlur={(e) => {
        const corrected = onBlur(e.target.value);
        if (corrected !== undefined) e.target.value = corrected;
      }}
      placeholder={placeholder}
      rows={1}
      className={className}
    />
  );
}

/** The status pill, opened into a small menu over the four GoalStatus values. */
function StatusMenu({
  status,
  onPick,
}: {
  status: GoalStatus;
  onPick: (status: GoalStatus) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-[9px] py-[2px] text-xs font-semibold text-accent-ink transition-opacity hover:opacity-80"
      >
        {statusLabel(status)}
        <Icon name="chevronDown" size={11} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-10 w-[140px] rounded-lg border border-line bg-surface p-1 shadow">
          {STATUS_VALUES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onPick(s);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-raise ${
                s === status ? "font-medium text-ink" : "text-ink-2"
              }`}
            >
              {statusLabel(s)}
              {s === status && (
                <span className="text-accent">
                  <Icon name="check" size={13} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Meta row: context, the editable status pill, and the editable/clearable target date. */
function GoalMeta({
  goal,
  onStatus,
  onTarget,
}: {
  goal: Goal;
  onStatus: (status: GoalStatus) => void;
  onTarget: (target: IsoDate | null) => void;
}): JSX.Element {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5 text-[13px] text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <ContextDot context={goal.context} />
        {goal.context}
      </span>
      <span className="text-ink-3">·</span>
      <StatusMenu status={goal.status} onPick={onStatus} />
      <span className="text-ink-3">·</span>
      <span className="inline-flex items-center gap-[5px]">
        <Icon name="calendar" size={13} />
        Target
        <DateField
          value={goal.target}
          onPick={onTarget}
          placeholder="none"
          className="rounded px-1 py-0.5 text-[13px] text-ink-2 underline decoration-dotted decoration-ink-3 underline-offset-2 outline-none transition-colors hover:bg-raise hover:text-ink"
        />
        {goal.target && (
          <button
            type="button"
            onClick={() => onTarget(null)}
            aria-label="Clear target date"
            title="Clear the target date"
            className="text-ink-3 transition-colors hover:text-accent-ink"
          >
            <Icon name="x" size={12} />
          </button>
        )}
      </span>
    </div>
  );
}

/** The full editable header: meta row, the serif title, and the serif description. */
export function GoalHeader({ goal, onSave }: GoalHeaderProps): JSX.Element {
  const saveTitle = (value: string): string => {
    const resolved = resolveTitle(goal.title, value);
    if (resolved !== goal.title) onSave({ title: resolved });
    return resolved;
  };

  const saveDescription = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed !== goal.description) onSave({ description: trimmed });
    return trimmed;
  };

  return (
    <>
      <GoalMeta
        goal={goal}
        onStatus={(status) => onSave({ status })}
        onTarget={(target) => onSave({ target })}
      />
      <GrowField
        fieldKey={goal.id}
        defaultValue={goal.title}
        onBlur={saveTitle}
        className="m-0 mb-3.5 w-full resize-none overflow-hidden border-none bg-transparent font-serif text-[38px] font-medium leading-[1.08] tracking-[-.015em] text-ink outline-none"
      />
      <GrowField
        fieldKey={goal.id}
        defaultValue={goal.description}
        onBlur={saveDescription}
        placeholder="Add a description for this goal…"
        className="m-0 mb-1.5 max-w-[600px] w-full resize-none overflow-hidden border-none bg-transparent font-serif text-[18px] leading-[1.6] text-ink-2 outline-none placeholder:italic placeholder:text-ink-3"
      />
    </>
  );
}

export default GoalHeader;
