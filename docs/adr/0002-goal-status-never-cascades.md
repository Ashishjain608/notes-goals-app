# Goal status never cascades to its tasks or notes

A Goal's status (`active | onhold | done | dropped`) is a label on the Goal alone. Marking a Goal `done` or `dropped` does **not** change, hide, complete, or drop the Tasks and Notes that link to it — those stay exactly as they are, and any open linked Tasks keep surfacing in Today until the user resolves them individually.

This is the outward face of the single-source-of-truth principle: a Goal never owns or reaches into its Tasks/Notes (their lists are computed by matching `goalId`), so it has nothing to cascade. We accept the mild surprise of "I closed the goal but its tasks still appear" in exchange for zero hidden side-effects; the user drops stray tasks themselves if they want them gone.

## Consequences

- No bulk operation runs when a Goal's status changes — it is a one-field write to the Goal file.
- A future "close goal and its open tasks?" convenience prompt is possible later, but it must be an explicit user choice, never automatic.
