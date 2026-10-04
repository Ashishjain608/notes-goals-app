/**
 * PhoneGoals — the phone Goals tab (ADR-0012). Active / On hold sections,
 * closed goals behind a "Closed (n)" toggle. No "New goal" button: new goals
 * come from the FAB composer's Goal mode.
 */
import { useMemo, useState, type JSX } from "react";
import type { Goal } from "@/types";
import { useStore, selectGoalSections, selectGoalProgress, selectGoalNext } from "@/store";
import { Icon } from "@/components";
import { GoalRow } from "@/components/GoalRow";
import { PhoneHeader } from "@/shell/phone/PhoneHeader";

const LABEL = "mb-2 mt-6 px-1 text-[12px] font-semibold uppercase tracking-[.07em] text-ink-3";

export default function PhoneGoals(): JSX.Element {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const contextFilter = useStore((s) => s.contextFilter);
  const navigate = useStore((s) => s.navigate);
  const [showClosed, setShowClosed] = useState(false);

  const { active, onHold, closed } = useMemo(
    () => selectGoalSections(goals, contextFilter),
    [goals, contextFilter],
  );

  const open = (id: string): void => navigate("goal", id);
  const row = (g: Goal): JSX.Element => {
    const { done, total } = selectGoalProgress(g.id, tasks);
    return (
      <li key={g.id}>
        <GoalRow goal={g} done={done} total={total} next={selectGoalNext(g.id, tasks)?.title ?? null} onOpen={open} />
      </li>
    );
  };

  return (
    <div className="scroll h-full overflow-y-auto px-4 pt-3">
      <PhoneHeader title="Goals" subline={`${active.length} active${onHold.length ? ` · ${onHold.length} on hold` : ""}`} />
      {active.length === 0 && onHold.length === 0 && (
        <p className="py-12 text-center italic text-ink-3">No active goals. Add one with the + button.</p>
      )}
      {active.length > 0 && (
        <>
          <h2 className={LABEL}>Active</h2>
          <ul className="flex flex-col gap-3">{active.map(row)}</ul>
        </>
      )}
      {onHold.length > 0 && (
        <>
          <h2 className={LABEL}>On hold</h2>
          <ul className="flex flex-col gap-3">{onHold.map(row)}</ul>
        </>
      )}
      {closed.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showClosed}
            onClick={() => setShowClosed((v) => !v)}
            className="mt-4 flex min-h-11 items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-[.07em] text-ink-3"
          >
            <Icon name="chevron" size={13} className={showClosed ? "rotate-90" : ""} />
            Closed ({closed.length})
          </button>
          {showClosed && (
            <ul className="flex flex-col gap-3">
              {closed.map((g) => {
                const { done, total } = selectGoalProgress(g.id, tasks);
                return (
                  <li key={g.id} className="opacity-70">
                    <GoalRow goal={g} done={done} total={total} next={null} onOpen={open} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
