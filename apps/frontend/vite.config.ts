import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev server: API calls go to the backend on :8000; page loads (Accept: text/html) stay with Vite.
const api = { target: "http://localhost:8000", bypass: (req: { headers: { accept?: string } }) => (req.headers.accept?.includes("text/html") ? "/index.html" : undefined) };
export default defineConfig({
  plugins: [react()],
  server: { proxy: Object.fromEntries(["/login", "/outlets", "/run", "/approve", "/runs", "/admin", "/health"].map((p) => [p, api])) },
});
