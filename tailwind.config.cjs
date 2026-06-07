/**
 * App-level Tailwind config. The actual design language lives in the shared,
 * framework-agnostic preset under ./design so it can be reused by a future
 * web app (see docs/adr/0007).
 */
const preset = require("./design/tailwind-preset.cjs");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
};
