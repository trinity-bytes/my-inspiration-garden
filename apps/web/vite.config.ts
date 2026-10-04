import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Mirrors the production same-origin topology (docs/api.md — the Worker
// serves /api/* and /auth/* on the same hostname as the web app) against
// the local `wrangler dev` server, so the app talks to the API the same
// way in dev as it will in production: same-origin, credentials:
// "same-origin", no CORS. 8787 is `wrangler dev`'s default port
// (apps/api/wrangler.jsonc has no `dev.port` override).
const API_DEV_SERVER = "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": API_DEV_SERVER,
      "/auth": API_DEV_SERVER,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // Let the design-token parity test read tokens.css via `?raw` (CSS is otherwise stubbed empty).
    css: { include: [/tokens\.css/] },
  },
});
