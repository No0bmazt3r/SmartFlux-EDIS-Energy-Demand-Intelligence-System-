import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev server: API calls go to the backend on :8000; page loads (Accept: text/html) stay with Vite.
const api = { target: "http://localhost:8000", bypass: (req: { headers: { accept?: string } }) => (req.headers.accept?.includes("text/html") ? "/index.html" : undefined) };
export default defineConfig({
  plugins: [react()],
  // /auth is always proxied: the Google redirect is a page load that must reach the API, not the SPA.
  server: { proxy: { ...Object.fromEntries(["/login", "/signup", "/me", "/users", "/outlets", "/run", "/approve", "/runs", "/franchise", "/health"].map((p) => [p, api])), "/auth": { target: api.target } } },
});
