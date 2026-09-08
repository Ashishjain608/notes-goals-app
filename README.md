# Notes & Goals

[![CI](https://github.com/Ashishjain608/notes-goals-app/actions/workflows/ci.yml/badge.svg)](https://github.com/Ashishjain608/notes-goals-app/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/Ashishjain608/notes-goals-app)](https://github.com/Ashishjain608/notes-goals-app/releases/latest)

A calm, local-first macOS app that unifies your daily **tasks**, **notes**, and longer-term **goals** — all stored as plain, inspectable files in a folder you choose. No database server, no cloud, no accounts, no sync. Things/Bear in spirit, never Notion/ClickUp.

## Download

- **[Latest release](https://github.com/Ashishjain608/notes-goals-app/releases/latest)** — macOS 12 (Monterey) or later, Apple Silicon and Intel.
- Or read more at **[the website](https://ashishjain608.github.io/notes-goals-app/)**.

Download the `.dmg`, open it, and drag **Notes & Goals** into Applications. Release builds are unsigned unless noted otherwise on the release, so the first launch trips Gatekeeper ("Notes & Goals can't be opened because Apple cannot check it for malicious software"). Either:

- Right-click (or Control-click) the app in Applications and choose **Open**, then confirm in the dialog that appears — only needed once, or
- Run `xattr -dr com.apple.quarantine "/Applications/Notes & Goals.app"` in Terminal.

On first launch you'll be asked to choose a data folder — you can change it later from **Settings (⌘,)**.

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

## Highlights

- **Today** — a live view of open, un-snoozed tasks; carry-forward is automatic, there's no daily page.
- **The day's slate** — commit up to five tasks (office and personal mixed) to today; finish them all and the day is done. No points, no streaks, no penalties — just a finish line.
- **Global search** — ⌘K searches tasks, goals, notebooks and notes, note *bodies* included, and jumps straight to the result.
- **Tasks** — priority flags, due dates, snooze, single-level subtasks, and a slide-in detail panel.
- **Notes** — a WYSIWYG editor (headings, lists, checkboxes, quotes, a divider, links that open in your browser on ⌘-click, and smart `--`→— / `...`→…), organized into **context-scoped notebooks** with drag-and-drop filing.
- **Goals** — progress computed live from linked tasks, plus notes you can **add and edit in place** (they also appear in Notes).
- **Activity** — a read-only look back at the tasks you created and completed on any chosen day.
- **Scratchpad** — a floating, draggable brain-dump pad (⌘J) that lives only on your device, never in the vault.
- An **Office / Personal** context filter across every view, light + dark themes, and a ⌘K command palette.

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

On first launch, choose a data folder. The app creates the `tasks/`, `notes/`, `goals/`, `notebooks/`, and `.atlas/` subfolders for you.

## Build a distributable app

```bash
npm run tauri:build
```

The bundled `.app` and `.dmg` land in `src-tauri/target/release/bundle/`. A local build like this is unsigned — see the Gatekeeper workaround in [Download](#download) — unless you configure your own Apple signing identity.

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
  views/        Today, Backlog, Activity, Notes, Goals, Capture (quick-add/palette/detail)
  shell/        title bar, nav rail, sidebar toggle, scratchpad, vault gate
src-tauri/     Rust backend: model, vault, store_io, commands
```

## Documentation

- [`CONTEXT.md`](CONTEXT.md) — domain glossary
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — the full build plan
- [`docs/adr/`](docs/adr/) — architectural decision records
- [`docs/agents/BUILD_CONTRACT.md`](docs/agents/BUILD_CONTRACT.md) — frozen module interfaces

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, conventions, and the checks a PR needs to pass.

## License

[MIT](LICENSE) © 2026 Ashish Jain
