# Cross-format fixtures

The Mac writes data files in Rust (`src-tauri/src/store_io.rs`), and the phone app writes them in TypeScript
(`src/lib/backend/vaultFormat.ts`). Each side writes the six entities below into its own folder, and each
side's tests parse the other side's folder and assert the values match. Byte-for-byte equality is not
required, but the parsed values must be equal.

- `rust/`: written by a Rust test when `UPDATE_FIXTURES=1`, checked in.
- `ts/`: written by a vitest test when `UPDATE_FIXTURES=1`, checked in.

Timestamps: `T0 = 2026-06-07T06:30:00Z`, `T1 = 2026-06-09T10:00:00Z`.

| File | Entity |
|---|---|
| `task-full.json` | Task `11111111-1111-4111-8111-111111111111`, title `Call the bank: "yes" or no?`, office, status done, created T0, due `2026-06-10`, snoozeUntil null, completed `2026-06-08T09:15:00Z`, goalId `33333333-3333-4333-8333-333333333333`, subtasks `[{id:"s1", title:"Find the account number", status:done}, {id:"s2", title:"Ask about fees", status:open}]`, details `"Line one\nLine two — ünïcödé ✓"`, priority true, attachments `[{path:"attachments/11111111-1111-4111-8111-111111111111/statement.pdf", name:"statement.pdf", size:2048, added:"2026-06-07T06:31:00Z"}]`, committedOn `2026-06-08`, carried 2 |
| `task-minimal.json` | Task `22222222-2222-4222-8222-222222222222`, title `yes`, personal, open, created T0, due/snoozeUntil/completed/goalId/committedOn null, subtasks `[]`, details `""`, priority false, attachments `[]`, carried 0 |
| `goal.json` | Goal `33333333-3333-4333-8333-333333333333`, title `123`, description `"# Plan\n\n- step: one"`, personal, onhold, target `2026-12-31`, created T0, updated T1 |
| `notebook.json` | Notebook `44444444-4444-4444-8444-444444444444`, name `Reading: 2026`, office, created T0, updated T1 |
| `note-full.md` | Note `55555555-5555-4555-8555-555555555555`, title `null`, office, goalId `33333333-…`, notebookId `44444444-…`, created T0, updated T1, attachments `[{path:"attachments/55555555-5555-4555-8555-555555555555/sketch.png", name:"sketch.png", size:512, added:"2026-06-07T06:31:00Z"}]`; body `"# Heading\n\nSome *markdown* with --- inside\n\n---\n\nAfter a rule.\n"` |
| `note-minimal.md` | Note `66666666-6666-4666-8666-666666666666`, title `Plain title`, personal, goalId null, notebookId null, created T0, updated T0, attachments `[]`; body `""` |

The tricky titles (`yes`, `123`, `null`, colons, quotes, non-ASCII) are deliberate. They catch YAML
writers that drop the quotes a scalar needs.
