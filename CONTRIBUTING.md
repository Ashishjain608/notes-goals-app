# Contributing

Thanks for helping out. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
Security problems go through [`SECURITY.md`](SECURITY.md), never a public issue.

## Contents

- [Ways to contribute](#ways-to-contribute)
- [Before you start](#before-you-start)
- [First-time contributors](#first-time-contributors)
- [Development setup](#development-setup)
- [Making a change](#making-a-change)
- [Commit and PR titles](#commit-and-pr-titles)
- [Opening a pull request](#opening-a-pull-request)
- [Review and merge](#review-and-merge)
- [Releasing](#releasing-maintainers)
- [License](#license)

## Ways to contribute

- **Bugs and ideas** go through the [issue forms](https://github.com/Ashishjain608/notes-goals-app/issues/new/choose).
- **Code and docs** land through pull requests — see below for when to open an issue first.
- Notable changes are recorded in [`CHANGELOG.md`](CHANGELOG.md).

## Before you start

**Open an issue first** (or comment on an existing one) for anything non-trivial: new features,
behaviour changes, anything touching a domain rule in [`CONTEXT.md`](CONTEXT.md) or an
[ADR](docs/adr/), or UI flow changes. Wait for a maintainer's go before building — it avoids
wasted work on something that doesn't fit or is already underway.

**Open a PR directly** for: typo and docs fixes, small obvious bug fixes, and test additions.

Comment on an issue to claim it, so two people don't build the same thing.

## First-time contributors

Look for [`good first issue`](https://github.com/Ashishjain608/notes-goals-app/labels/good%20first%20issue)
or `help wanted`. If you get stuck, ask in the issue — no need to figure it out alone.

## Development setup

### Prerequisites

- **Rust** (stable) — install via [rustup](https://rustup.rs)
- **Node.js 18+** (developed on Node 26)
- **Xcode Command Line Tools** — `xcode-select --install`

### Run / test / build

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

## Making a change

Fork the repo, then branch from `main`. Suggested branch names: `fix/short-desc`,
`feat/short-desc`, `docs/short-desc` (not enforced). Commit as you go, push to your fork, and
keep each PR focused on one change — easier to review, easier to revert if needed.

If `main` drifts while you're working, rebase on top of it. No need to squash your own commits
first — the merge does that.

### Where things live

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

### Conventions

- **Rust owns all filesystem I/O; the frontend holds the working store** (see [ADR-0006](docs/adr/0006-rust-owns-io-frontend-holds-store.md)). Reads and writes go through Rust commands; Zustand holds the in-memory copy views render from. Don't add frontend file I/O or a second Rust-side in-memory index.
- **New model fields must be `#[serde(default)]`** on the Rust struct, so older files on disk without the field still deserialize.
- **Keep components store-free.** Components under `src/components/` are presentational — they take props, not store hooks. Store access belongs in `views/` and `shell/`.
- [`docs/adr/`](docs/adr/) is the design record — read the relevant ADRs before changing behavior they cover, and add a new one for a decision worth remembering.

### Domain language

[`CONTEXT.md`](CONTEXT.md) is the glossary for this app's domain terms (Task, Goal, Context, Slate, etc.) — read it before renaming or reshaping a concept.

## Commit and PR titles

No Conventional Commits prefixes (no `feat:`, `fix:`, etc.). Match this repo's history:
imperative, sentence case, describes the user-visible outcome, 72 characters or less, no
trailing period. Real examples from this repo:

- "Draw the settings icon as a gear"
- "Walk new users through choosing their data folder"

Explain *why* in the body, not the title. Reference issues with "Closes #123" in the PR
description.

## Opening a pull request

Open the PR against `main`. Use the PR template's checklist as a guide:

- The three checks pass (typecheck, tests, `cargo test`).
- You tried the change in the running app.
- Screenshots in light and dark for any UI change.
- [`CONTEXT.md`](CONTEXT.md) / [ADR](docs/adr/) updated if this changes a domain rule.
- [`CHANGELOG.md`](CHANGELOG.md) has a line under `## [Unreleased]` for any user-visible change.

Draft PRs are welcome if you want early feedback before the change is finished.

### AI-assisted contributions

This app is itself built with AI tools, so AI-assisted contributions are welcome. A few rules
keep quality up:

- A human must understand, run, and test every change, and be able to explain it in review.
- Say in the PR description if a substantial part was AI-generated.
- Don't use AI to write your replies to review comments — respond in your own words.
- PRs opened by autonomous agents with no human in the loop will be closed.

## Review and merge

`main` is protected — nobody, maintainer included, pushes to it directly. Every change lands
through a PR that passes CI (typecheck, vitest, `cargo test`). History stays linear: PRs are
squash-merged, so your PR title becomes the commit subject on `main`.

The maintainer works on this in spare time and aims to give a first response within a week
(same target as security reports). A polite ping after a week of silence is fine. A PR waiting
on its author for 30 days with no reply may be closed — it can always be reopened.

## Releasing (maintainers)

1. Bump the version together in `package.json`, `src-tauri/tauri.conf.json`, and
   `src-tauri/Cargo.toml`.
2. Move the `[Unreleased]` entries in `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD`
   heading.
3. Merge that PR.
4. `git tag vX.Y.Z && git push origin vX.Y.Z` — the Release workflow builds the universal
   `.dmg` and publishes the GitHub Release.

The workflow signs the app with the maintainer's Developer ID and notarizes it; the `APPLE_*`
repository secrets it reads are listed in [`release.yml`](.github/workflows/release.yml).

## License

By contributing, you agree your contributions are licensed under this repo's [MIT license](LICENSE), same as the rest of the project.
