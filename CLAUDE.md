# CLAUDE.md

Notes & Goals — a calm, local-first macOS app for tasks, notes and goals (Tauri 2 + React/TypeScript + Rust).

Read before changing code:

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, checks, conventions, and how changes land (pull requests only; `main` is protected).
- [`CONTEXT.md`](CONTEXT.md) — the domain glossary. Use its terms in code and UI copy (say "data folder", never a bare "folder").
- [`docs/adr/`](docs/adr/) — decisions already made. Don't contradict one without adding a new ADR.

Every change must pass:

```bash
npm run typecheck && npm test && cargo test --manifest-path src-tauri/Cargo.toml
```

Rules that are easy to break:

- Rust owns all filesystem I/O; the frontend holds the working store (ADR-0006). No file access from TypeScript.
- New Rust model fields need `#[serde(default)]` so files already on disk still load.
- Components in `src/components/` stay store-free; store access belongs in `src/views/` and `src/shell/`.
- Check UI changes in the running app (`npm run tauri:dev`) in both light and dark themes.
