/**
 * Shared, framework-agnostic Tailwind preset — the single source of the visual
 * language for Notes & Goals. Consumed by this Tauri app today and reusable by a
 * future web app (see docs/adr/0007).
 *
 * Colors resolve to CSS custom properties whose VALUES live in ./tokens.css and
 * are swapped at runtime by the `[data-theme]` attribute (Spectrum light/dark).
 * That is what makes runtime theme switching possible while keeping Tailwind's
 * utility ergonomics.
 *
 * Token names mirror the design prototype exactly so the look stays pixel-true.
 */

/** @type {Partial<import('tailwindcss').Config>} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Surfaces & neutrals
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        raise: "var(--raise)",
        // Ink (text) ramp
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        // Hairlines
        line: "var(--line)",
        "line-2": "var(--line-2)",
        // Accent
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        "accent-soft": "var(--accent-soft)",
        "accent-line": "var(--accent-line)",
        // Warn (aging / due cues)
        "warn-soft": "var(--warn-soft)",
        "warn-ink": "var(--warn-ink)",
        // Functional context colour (Spectrum): Office = indigo, Personal = emerald
        "ctx-office": "var(--ctx-office)",
        "ctx-personal": "var(--ctx-personal)",
        // Heat-scale aging (Spectrum): amber (3–6d) → red (7+d). The stale-row
        // tint is a gradient, so it lives as the .age-stale-tint utility, not here.
        "age-aging-ink": "var(--age-aging-ink)",
        "age-stale-ink": "var(--age-stale-ink)",
        "age-stale-bar": "var(--age-stale-bar)",
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "system-ui", "sans-serif"],
        serif: ["Newsreader", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        DEFAULT: "var(--shadow)",
        sm: "var(--shadow-sm)",
      },
      borderRadius: {
        // The prototype leans on 7–14px radii.
        sm: "5px",
        DEFAULT: "7px",
        md: "9px",
        lg: "11px",
        xl: "14px",
      },
      keyframes: {
        panelIn: {
          from: { transform: "translateX(16px)", opacity: "0" },
          to: { transform: "none", opacity: "1" },
        },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        riseIn: {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "none", opacity: "1" },
        },
        overlayIn: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        panelIn: "panelIn .25s cubic-bezier(.2,.7,.2,1)",
        fadeIn: "fadeIn .15s ease",
        riseIn: "riseIn .2s ease",
        overlayIn: "overlayIn .15s ease",
      },
    },
  },
};
