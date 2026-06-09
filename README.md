# Notes & Goals

A calm, local-first macOS app that unifies your daily **tasks**, **notes**, and longer-term **goals** — all stored as plain, inspectable files in a folder you choose. No database server, no cloud, no accounts, no sync. Things/Bear in spirit, never Notion/ClickUp.

## The idea

The **task is the source of truth**, not a daily page. **Today** is a live query over all your tasks: an open task keeps appearing there until you mark it _done_ or _dropped_. Carry-forward is automatic and invisible — there's no copy-paste, no migration, ever. Tasks and notes connect to goals, and a goal's progress is computed live from its linked tasks.

Your data lives in a folder ("vault") you pick on first launch:

```
<vault>/tasks/<uuid>.json      one file per task
<vault>/notes/<uuid>.md        YAML frontmatter + markdown body
<vault>/goals/<uuid>.json      one file per goal
<vault>/notebooks/<uuid>.json  one file per notebook (groups notes; ADR-0008)
<vault>/.atlas/trash/          deleted files (never hard-unlinked)
```

Plain files mean it's portable and git/Dropbox/iCloud-friendly — point the folder wherever you like; that's your call, not the app's.

## Tech stack

- **[Tauri 2](https://tauri.app)** → a real native macOS `.app`
- **React + TypeScript + Tailwind** frontend (design tokens live in a reusable preset under `design/`)
- **Rust** owns all filesystem I/O (atomic writes); the frontend holds the working store
- **TipTap** WYSIWYG notes editor, serialized to portable Markdown
- **Zustand** for state

## Prerequisites

- **Rust** (stable) — install via [rustup](https://rustup.rs)
- **Node.js 18+** (developed on Node 26)
- **Xcode Command Line Tools** — `xcode-select --install`

## Getting started

```bash
npm install          # install frontend deps
npm run tauri:dev    # launch the app (first Rust build takes a few minutes)
```

On first launch, choose a data folder. The app creates the `tasks/`, `notes/`, `goals/`, and `.atlas/` subfolders for you.

## Build a distributable app

```bash
npm run tauri:build
```

The bundled `.app` lands in `src-tauri/target/release/bundle/macos/`. (This is a personal-use build — no code signing or notarization is configured.)

## Tests

```bash
npm test                                         # frontend: dates, selectors, components
cargo test --manifest-path src-tauri/Cargo.toml  # backend: storage round-trips
```

## Project layout

```
design/        shared Tailwind preset + tokens.css (reusable by a future web app)
src/
  types.ts     shared domain contract
  lib/         dates (local-day math), ipc (typed Rust commands), markdown
  components/   presentational, store-free component library
  store/        Zustand store + pure selectors (the live "queries")
  views/        Today, Backlog, Notes, Goals, Capture (quick-add/palette/detail)
  shell/        nav rail, top chrome, vault gate
src-tauri/     Rust backend: model, vault, store_io, commands
```

## Documentation

- [`CONTEXT.md`](CONTEXT.md) — domain glossary
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — the full build plan
- [`docs/adr/`](docs/adr/) — architectural decision records
- [`docs/agents/BUILD_CONTRACT.md`](docs/agents/BUILD_CONTRACT.md) — frozen module interfaces

## License

[MIT](LICENSE) © 2026 Ashish Jain
