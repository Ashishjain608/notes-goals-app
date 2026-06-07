# Date storage formats and local-day semantics

The app's core "Today" query depends on a precise definition of "today," and the model mixes instants with calendar days. We decided:

- **Datetimes** (`created`, `completed`) are stored as **UTC ISO-8601 with `Z`** (e.g. `2026-06-07T06:30:00Z`).
- **Calendar dates** (`due`, `snoozeUntil`) are stored as bare **`YYYY-MM-DD`** — no time, no zone, because a due date is a day, not an instant.
- **All day-boundary math is done in the user's local timezone**, never UTC. "Today," "completed today," "snoozeUntil ≤ today," and Age all convert any instant to local time first, then compare calendar days. A task finished at 23:30 local on June 6 (stored `...T06:30:00Z` on June 7) still counts as completed *today* on June 6.

The Today query recomputes on window focus and navigation; a precise midnight-rollover timer is a deliberate non-goal for v1.

## Behavioral consequences (ratified)

- `snoozeUntil == today` → the task reappears in Today (snooze is inclusive "until").
- A task **dropped** today disappears from Today immediately; only a task **done** today keeps a courtesy slot in Today.

## Why record this

The on-disk date formats are a persisted contract (hard to change after files exist), and the "two formats + always-local day math" combination is non-obvious — a future reader would otherwise wonder why dates and datetimes are stored differently and might "simplify" to UTC day math, silently breaking late-night completions.
