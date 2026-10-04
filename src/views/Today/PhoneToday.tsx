/**
 * PhoneToday — Today on the phone (ADR-0012): date title, slot meter, the
 * committed tasks as cards, then Available rows grouped Office / Personal and
 * a collapsed Completed group. Same data as desktop (`selectToday`, unchanged).
 */
import { useMemo, useState, type JSX } from "react";
import type { Task } from "@/types";
import { useStore, selectToday, selectSlate, goalsById } from "@/store";
import { ContextDot, Icon } from "@/components";
import { SlotMeter } from "@/components/SlotMeter";
import { SlateCard } from "@/components/SlateCard";
import { TaskRowCompact } from "@/components/TaskRowCompact";
import { PhoneHeader } from "@/shell/phone/PhoneHeader";
import { ageInDays } from "@/lib/dates";
import { metaLine, toggleDoneWithUndo } from "@/views/Backlog/taskLogic";

const headline = (now: Date): string =>
  now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

export default function PhoneToday(): JSX.Element {
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const contextFilter = useStore((s) => s.contextFilter);
  const day = useStore((s) => s.day);
  const slateCap = useStore((s) => s.slateCap);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const [showDone, setShowDone] = useState(false);

  const view = useMemo(() => selectToday(tasks, contextFilter), [tasks, contextFilter, day]);
  const slate = useMemo(() => selectSlate(tasks, slateCap), [tasks, slateCap, day]);
  const gById = useMemo(() => goalsById(goals), [goals]);

  const row = (t: Task): JSX.Element => {
    const m = metaLine(t, t.goalId ? (gById[t.goalId] ?? null) : null, day);
    return (
      <TaskRowCompact
        key={t.id}
        title={t.title}
        meta={m.text || undefined}
        overdue={m.overdue}
        done={t.status === "done"}
        onToggle={() => toggleDoneWithUndo(t)}
        onOpen={() => openTaskDetail(t.id)}
      />
    );
  };

  // Slate-done tasks already show as cards; Completed lists the rest.
  const slateDoneIds = new Set(view.slateDone.map((t) => t.id));
  const completed = view.completedToday.filter((t) => !slateDoneIds.has(t.id));
  const available = view.office.length + view.personal.length;
  const groups = [
    { context: "office" as const, label: "Office", tasks: view.office },
    { context: "personal" as const, label: "Personal", tasks: view.personal },
  ].filter((g) => g.tasks.length > 0);

  return (
    <div className="scroll h-full overflow-y-auto px-4 pt-3">
      <PhoneHeader
        title={headline(new Date())}
        subline={`${slate.count} of ${slate.cap} committed · ${slate.doneCount} done`}
      />
      <SlotMeter cap={slate.cap} filled={slate.count} trailing={`${slate.openCount} open`} />

      <div className="mt-4 flex flex-col gap-2">
        {slate.complete && (
          <div className="rounded-2xl border border-accent-line bg-accent-soft px-4 py-3.5">
            <div className="font-serif text-[20px] text-ink">Day complete.</div>
            <div className="text-[14px] text-ink-2">Anything else today is a bonus.</div>
          </div>
        )}
        {slate.count === 0 && available > 0 && (
          <p className="rounded-2xl border border-dashed border-line-2 px-4 py-3.5 text-[14px] text-ink-2">
            <span className="font-medium text-ink">Pick today&rsquo;s work.</span> Open a task below and tap
            Commit, up to {slate.cap}.
          </p>
        )}
        {view.committed.map((t) => {
          const age = ageInDays(t.created);
          // Committed today, so skip metaLine's "On today" part.
          const m = metaLine({ ...t, committedOn: null }, t.goalId ? (gById[t.goalId] ?? null) : null, day);
          return (
            <SlateCard
              key={t.id}
              title={t.title}
              context={t.context}
              done={false}
              meta={
                <>
                  <span className={m.overdue ? "font-semibold text-age-stale-ink" : undefined}>{m.text}</span>
                  {m.text && age >= 3 && " · "}
                  {age >= 3 && (
                    <span className={age >= 7 ? "font-semibold text-age-stale-ink" : "font-semibold text-age-aging-ink"}>
                      {age}d
                    </span>
                  )}
                </>
              }
              onToggle={() => toggleDoneWithUndo(t)}
              onOpen={() => openTaskDetail(t.id)}
            />
          );
        })}
        {view.slateDone.map((t) => (
          <SlateCard
            key={t.id}
            title={t.title}
            context={t.context}
            done
            onToggle={() => toggleDoneWithUndo(t)}
            onOpen={() => openTaskDetail(t.id)}
          />
        ))}
      </div>

      {available > 0 && (
        <section className="mt-[26px]">
          <h2 className="mb-2 flex items-baseline gap-2 text-[17px] font-semibold text-ink">
            Available <span className="text-[14px] font-normal text-ink-2">{available}</span>
          </h2>
          {groups.map((g) => (
            <div key={g.context} className="mb-3">
              {contextFilter === "all" && (
                <h3 className="mb-2 mt-3 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
                  <ContextDot context={g.context} size={9} />
                  {g.label}
                </h3>
              )}
              <div className="flex flex-col gap-1.5">{g.tasks.map(row)}</div>
            </div>
          ))}
        </section>
      )}
      {slate.count === 0 && available === 0 && completed.length === 0 && view.slateDone.length === 0 && (
        <p className="mt-10 text-center text-[15px] italic text-ink-3">Nothing waiting on you.</p>
      )}

      {completed.length > 0 && (
        <section className="mt-5">
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
            className="flex min-h-[44px] w-full items-center gap-2 text-left text-[15px] font-semibold text-ink-2"
          >
            <span className={showDone ? "rotate-90" : ""}>
              <Icon name="chevron" size={16} />
            </span>
            Completed today · {completed.length}
          </button>
          {showDone && <div className="mt-1 flex flex-col gap-1.5">{completed.map(row)}</div>}
        </section>
      )}
    </div>
  );
}
