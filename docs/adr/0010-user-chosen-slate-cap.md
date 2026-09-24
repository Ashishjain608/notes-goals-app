# The slate cap is the user's choice

Amends [ADR-0009](0009-the-day-slate.md), which fixed the slate at `SLATE_CAP = 5`.

Five is a good default, not a universal truth. Some days hold three real things, and some people
work in smaller pieces and can finish seven. A fixed number the user can't change reads as the app
disagreeing with them about their own day.

## Decisions

**The cap is a setting, bounded to 1–10, default 5.** Settings has a "Today's slate" stepper. The
bounds keep the mechanism intact: the cap still exists and still makes an extra commitment cost
you a slot. It can't be switched off.

**It's a per-Mac preference in `localStorage`, like the theme.** It isn't written to the data
folder. It's a preference about how you work, not data, and storing it in the vault would add a
file, a schema and a sync story for one number. The cost is setting it once on each Mac.

**Lowering the cap never takes a commitment away.** If today already holds more than the new cap,
those tasks stay committed. The slate reads "6 of 3 slots" and refuses new commitments until
you're back under the cap. Uncommitting is always allowed.

## Consequences

- `selectSlate(tasks, cap, now)` takes the cap as a parameter, and `SlateSummary.cap` carries it to
  the views. The rest of ADR-0009 (cross-context counting, expiry, no rewards) is unchanged.
- The store holds `slateCap` and persists it under `ng-slate-cap`. Stored values are clamped on read,
  so a hand-edited value can't break the slate.
