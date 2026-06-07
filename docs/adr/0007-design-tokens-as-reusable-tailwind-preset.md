# Design tokens live in a reusable Tailwind preset + CSS-variable theme layer

The styling system is packaged for reuse across this Tauri/macOS app **and a future web app**, rather than as an app-local Tailwind config. Two framework-agnostic pieces:

1. **A standalone Tailwind preset** (e.g. `design/tailwind-preset.cjs`) defining the semantic scale — colors, fonts (`Hanken Grotesk` / `Newsreader` / `JetBrains Mono`), shadows, radii, spacing — where color tokens resolve to CSS variables (`colors: { bg: 'var(--bg)', ink: 'var(--ink)', accent: 'var(--accent)', … }`).
2. **A tokens stylesheet** (e.g. `design/tokens.css`) defining the actual values of those variables for `:root` / `[data-theme="light"]` / `[data-theme="dark"]` and the accent set — copied verbatim from the design prototype's `<style>` block so colors are pixel-identical.

Each app consumes the preset via `presets: [require('./design/tailwind-preset.cjs')]` and imports `tokens.css`. This gives Tailwind utility ergonomics **and** runtime theme/accent switching (toggling `[data-theme]` or swapping accent vars) — something class-only Tailwind can't do without a full restyle — while keeping a single shared source of truth for the visual language.

## Why record this

A future reader seeing the var-indirection and a separate preset package would wonder why the tokens aren't just inline in `tailwind.config`. The reason is deliberate: cross-app reuse (web app later) + runtime theming. Restructuring a styling system after components are built against it is expensive, so the shape is fixed now.

## Consequences

- v1 ships light/dark as a real persisted setting and a single terracotta accent; the other accents exist as tokens but have no picker UI yet.
- The preset/tokens pair should avoid Tauri- or React-specific assumptions so it drops cleanly into a web build.
