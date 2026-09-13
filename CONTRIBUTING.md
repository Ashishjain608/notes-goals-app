# Contributing

Thanks for helping out. Bugs and ideas go through the [issue forms](https://github.com/Ashishjain608/notes-goals-app/issues/new/choose);
security problems go through [`SECURITY.md`](SECURITY.md), never a public issue. Everyone taking part follows the
[Code of Conduct](CODE_OF_CONDUCT.md). Notable changes are recorded in [`CHANGELOG.md`](CHANGELOG.md).

## Prerequisites

- **Rust** (stable) — install via [rustup](https://rustup.rs)
- **Node.js 18+** (developed on Node 26)
- **Xcode Command Line Tools** — `xcode-select --install`

## Run / test / build

```bash
npm install                                      # install frontend deps
npm run tauri:dev                                # launch the app in dev mode
npm run typecheck                                 # tsc --noEmit
npm test                                          # frontend tests (vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # backend tests
npm run tauri:build                               # bundled .app / .dmg
```

Run all three checks before opening a PR:

```bash
npm run typecheck && npm test && cargo test --manifest-path src-tauri/Cargo.toml
```

## Where things live

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

## Conventions

- **Rust owns all filesystem I/O; the frontend holds the working store** (see [ADR-0006](docs/adr/0006-rust-owns-io-frontend-holds-store.md)). Reads and writes go through Rust commands; Zustand holds the in-memory copy views render from. Don't add frontend file I/O or a second Rust-side in-memory index.
- **New model fields must be `#[serde(default)]`** on the Rust struct, so older files on disk without the field still deserialize.
- **Keep components store-free.** Components under `src/components/` are presentational — they take props, not store hooks. Store access belongs in `views/` and `shell/`.
- [`docs/adr/`](docs/adr/) is the design record — read the relevant ADRs before changing behavior they cover, and add a new one for a decision worth remembering.

## Domain language

[`CONTEXT.md`](CONTEXT.md) is the glossary for this app's domain terms (Task, Goal, Context, Slate, etc.) — read it before renaming or reshaping a concept.
