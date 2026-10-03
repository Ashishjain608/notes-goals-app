import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// @tauri-apps/cli sets TAURI_DEV_HOST when running `tauri dev`.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Inject CSP meta tag in web mode only.
    {
      name: "inject-csp",
      transformIndexHtml(html) {
        if (mode !== "web") return html;
        const cspContent =
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.dropboxapi.com https://content.dropboxapi.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";
        return html.replace(
          "</head>",
          `    <meta http-equiv="Content-Security-Policy" content="${cspContent}">\n  </head>`,
        );
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Tauri expects a fixed port and fails if it is not available.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      // Don't watch the Rust source tree from the Vite dev server.
      ignored: ["**/src-tauri/**"],
    },
  },
  ...(mode === "web" && {
    base: "./",
    build: {
      outDir: "dist-web",
      emptyOutDir: true,
    },
  }),
}));
