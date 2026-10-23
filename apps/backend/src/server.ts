// HTTP API on 0.0.0.0:8000 (PRD FR-70 to FR-74), plain node:http. Also serves the built web app, if present,
// and runs the weekly briefing scheduler.
//   POST /run              {outlet_id, as_of, question?, lang?, briefing?} → decisions, actions, unresolved, log
//   POST /approve          {action_id, decision: "approved" | "rejected"}
//   GET  /runs/:id         the stored result and every log event of one run (the Evidence screen)
//   GET  /admin/overview   ?as_of=YYYY-MM-DD   all-outlet view;   GET /admin/scope2.csv?as_of=...
//   GET  /health
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { loadConfig, type Config } from "./config.ts";
import { openHmem } from "./engines/hmem/index.ts";
import { decideAction } from "./orchestrator/memory.ts";
import { run } from "./orchestrator/run.ts";
import { WINDOW, validateRequest } from "./orchestrator/state.ts";
import { startScheduler } from "./scheduler.ts";
import { adminOverview, scope2Csv } from "./server/admin.ts";

class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

async function readJson(req: IncomingMessage) {
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > 100_000) throw new HttpError(413, "Request body too large"); }
  try { return body ? JSON.parse(body) : {}; } catch { throw new HttpError(400, "Body must be JSON"); }
}
const send = (res: ServerResponse, status: number, body: unknown, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const asOfParam = (url: URL) => {
  const asOf = url.searchParams.get("as_of") ?? WINDOW.end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || asOf < WINDOW.start || asOf > WINDOW.end) throw new HttpError(400, `as_of must be a date in ${WINDOW.start}..${WINDOW.end}`);
  return asOf;
};

export function createApp(cfg: Config, opts: { webDir?: string } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, mode: cfg.mode });
      if (req.method === "POST" && url.pathname === "/run") {
        let body;
        try { body = validateRequest(await readJson(req)); } catch (e) { throw e instanceof HttpError ? e : new HttpError(400, (e as Error).message); }
        return send(res, 200, await run(body, cfg, { echo: false }));
      }
      if (req.method === "POST" && url.pathname === "/approve") {
        const b = await readJson(req);
        if (typeof b.action_id !== "string" || !["approved", "rejected"].includes(b.decision)) throw new HttpError(400, 'Send {"action_id": "...", "decision": "approved" | "rejected"}');
        try { return send(res, 200, { ok: true, memory: decideAction(openHmem(cfg.hmemDir, cfg.logDir), b.action_id, b.decision).content }); }
        catch (e) { throw new HttpError(/No proposed|already decided/.test((e as Error).message) ? 409 : 500, (e as Error).message); }
      }
      const runMatch = url.pathname.match(/^\/runs\/(r-[0-9a-f]{8})$/);
      if (req.method === "GET" && runMatch) {
        const file = (ext: string) => join(cfg.logDir, `${runMatch[1]}${ext}`);
        if (!existsSync(file(".result.json"))) throw new HttpError(404, "No such run");
        return send(res, 200, { result: JSON.parse(readFileSync(file(".result.json"), "utf8")), events: readFileSync(file(".jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) });
      }
      if (req.method === "GET" && url.pathname === "/admin/overview") return send(res, 200, await adminOverview(cfg, asOfParam(url)));
      if (req.method === "GET" && url.pathname === "/admin/scope2.csv") return send(res, 200, scope2Csv(await adminOverview(cfg, asOfParam(url))), "text/csv");
      if (req.method === "GET" && opts.webDir && existsSync(opts.webDir)) {
        const safe = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
        const path = join(opts.webDir, safe);
        const file = path.startsWith(opts.webDir) && existsSync(path) && statSync(path).isFile() ? path : join(opts.webDir, "index.html"); // SPA routes
        return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? "application/octet-stream");
      }
      throw new HttpError(404, "Not found");
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      send(res, status, { error: (e as Error).message });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  createApp(cfg, { webDir: process.env.WEB_DIR ?? "apps/frontend/dist" }).listen(cfg.port, "0.0.0.0", () => {
    console.log(`SmartFlux API on http://0.0.0.0:${cfg.port} (data: ${cfg.mode.data}, reasoning: ${cfg.mode.llm})`);
    if (process.env.BRIEFING_SCHEDULER !== "off") startScheduler(cfg);
  });
}
