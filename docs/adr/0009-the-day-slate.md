# The day slate: a capped commitment, not a daily page

Today shows every open, un-snoozed task, forever. That is correct as a query and incomplete as a
workday: there is no state in which the app can say "that's it, you're done", so the list reads as a
place to write things down rather than a thing you work from. Tasks accumulate; nothing is ever
finished, only less unfinished.

We add a **slate**: the small set of tasks committed to a single local day.

## Decisions

**A commitment is a field on the Task, not a stored day.** `committedOn` holds a bare `YYYY-MM-DD`
(ADR-0004's calendar-date format), plus a `carried` counter. There is no `days/<date>.json`, no daily
note, no copy-forward step — Today stays a live query (CONTEXT.md), and the slate is simply a
narrower one. A stored day page would have been the app's first "page" entity, and would have needed
its own creation, migration, conflict and sync story for information that already lives on the task.

**A commitment expires with its day.** `committedOn` earlier than today is not a commitment today:
that task falls back into the pool. Nothing carries itself forward silently, which is what keeps the
slate an honest daily decision instead of a second backlog.

**The cap is the mechanism.** `SLATE_CAP = 5`. A day you can finish needs a small, fixed number of
slots; committing a sixth thing has to cost you a fifth. The cap is counted across **all** contexts
and ignores the global context filter — the scarce resource is the user's hours, not their
office/personal split. Dropping a task frees its slot.

**Finishing the slate is the reward, and the only one.** When every committed task is done, Today
renders a distinct "day complete" state. There are deliberately **no points, XP, levels, badges or
streaks**: attaching extrinsic rewards to work the user already cares about erodes the motivation
that was already there (the overjustification effect), and punishment mechanics — Habitica-style
health loss, unforgiving streaks — reliably drive people to abandon the *app* rather than complete
the task. The finish line the app previously lacked is the whole feature.

**The penalty is arithmetic, not pain.** Re-committing a task you promised on an earlier day and did
not finish increments `carried`, and the row shows `carried 3×`. It is the day-scoped sibling of the
existing Age cue: visible, quiet, and never blocking.

## Consequences

- `Task` gains two `#[serde(default)]` fields, so vault files written before this change still load.
- `selectToday` lifts today's committed tasks out of the office/personal columns into `committed`, so
  a task appears exactly once. A finished slate task stays in `completedToday` as well as `slateDone`.
- `selectSlate` is deliberately **not** part of `TodayView`: the cap and the finish line must not move
  when the context filter does.
- Snooze still wins. A snoozed task never appears on the slate, whatever its `committedOn` says.
- Tuning the number of slots is a one-line change to `SLATE_CAP`; nothing in the model encodes 5.
- If a streak is ever added, it must count days *finished* and forgive gaps — an unforgiving counter
  is the failure mode this ADR is explicitly avoiding.
