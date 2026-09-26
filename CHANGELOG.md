# Changelog

Notable changes to Notes & Goals. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-09-24

### Added

- **Choose how many slots today's slate has.** Settings → Today's slate sets the cap anywhere
  from 1 to 10 (default 5). Lowering it keeps what you've already committed today.

### Fixed

- Quick successive edits to a task no longer overwrite each other. Toggling priority twice in a
  row, or adding two subtasks quickly, used to lose the second change.
- Returning to the window while a save was still running could briefly undo that save.
- Pasting several files into a task keeps going when one fails, and reports that file.
- Today refreshes at midnight without needing another change first.

## [0.2.0] - 2026-09-15

### Added

- **Automatic updates.** The app checks GitHub for a newer release shortly after launch and
  every few minutes, downloads it in the background, and then shows **Restart to update** in the
  left rail above the scratchpad. Updates are signed; the app verifies the signature before
  installing. Builds before 0.2.0 don't have the updater, so install this one by hand once.

## [0.1.1] - 2026-09-15

### Fixed

- Choosing a data folder synced through iCloud Drive on another Mac no longer freezes the app.
  Files iCloud has evicted are downloaded first, the loading screen stays responsive, and if
  the download takes longer than a minute a "Try again" screen appears instead of a hang.

### Changed

- Every release now also uploads `Notes-Goals-macOS.dmg`, and the website's and README's
  Download links point at that stable name, so they always fetch the latest release.

## [0.1.0] - 2026-09-14

The first public release.

### Added

- **Today** — a live view of open tasks; carry-forward is automatic and there's no daily page.
- **The day's slate** — commit up to five tasks to today; finishing them completes the day.
- **Tasks** — priority, due dates, snooze, single-level subtasks, attachments, and a detail panel.
- **Notes** — a WYSIWYG editor that saves portable Markdown, grouped into context-scoped notebooks.
- **Goals** — progress computed from linked tasks, with notes you edit in place.
- **Activity** — a look back at the tasks created and completed on any day.
- **Search** — ⌘K across tasks, goals, notebooks, and note bodies.
- **Scratchpad** (⌘J), an Office / Personal filter, and light and dark themes.
- **Settings** (⌘,) to see, change, and reveal the data folder.
- A guided first run that walks through choosing the data folder.

### Security

- A Content Security Policy limits what the app's webview can load and run.

[Unreleased]: https://github.com/Ashishjain608/notes-goals-app/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Ashishjain608/notes-goals-app/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Ashishjain608/notes-goals-app/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Ashishjain608/notes-goals-app/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Ashishjain608/notes-goals-app/releases/tag/v0.1.0
