// HTTP API on 0.0.0.0:8000 (PRD FR-70 to FR-74), plain node:http. Also serves the built web app, if present,
// and runs the weekly briefing scheduler.
//   POST /run              {outlet_id, as_of, question?, lang?, briefing?} → decisions, actions, unresolved, log
//   POST /approve          {action_id, decision: "approved" | "rejected"}
//   GET  /runs/:id         the stored result and every log event of one run (the Evidence screen)
//   GET  /admin/overview   ?as_of=YYYY-MM-DD   all-outlet view;   GET /admin/scope2.csv?as_of=...
//   POST /login            {role, outlet_id?} → signed token (demo login);   GET /outlets   names for the login screen
//   GET  /outlets/:id/availability ?as_of&at   customer view;   POST /outlets/:id/reports {machine_id, reason, as_of}
//   GET  /outlets/:id/owner ?as_of             owner home, machines, approvals
//   GET  /health
// Every route except /health, /login and /outlets needs a token; roles and outlet scope per server/auth.ts.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { openSampleDb } from "./adapters/local-sqlite.ts";
import { loadConfig, type Config } from "./config.ts";
import { openHmem } from "./engines/hmem/index.ts";
import { decideAction } from "./orchestrator/memory.ts";
import { run } from "./orchestrator/run.ts";
import { WINDOW, validateRequest } from "./orchestrator/state.ts";
import { startScheduler } from "./scheduler.ts";
import { TEMPLATES } from "./templates/index.ts";
import { adminOverview, dataQuery, scope2Csv } from "./server/admin.ts";
import { deny, issueToken, POLICY, readToken, type Role } from "./server/auth.ts";
import { availability, ownerView, recordReport, REPORT_REASONS } from "./server/outlet.ts";

class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

async function readJson(req: IncomingMessage) {
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > 100_000) throw new HttpError(413, "Request body too large"); }
  try { return body ? JSON.parse(body) : {}; } catch { throw new HttpError(400, "Body must be JSON"); }
}
const send = (res: ServerResponse, status: number, body: unknown, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const asOfParam = (url: URL) => {
  const asOf = url.searchParams.get("as_of") ?? WINDOW.end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || asOf < WINDOW.start || asOf > WINDOW.end) throw new HttpError(400, `as_of must be a date in ${WINDOW.start}..${WINDOW.end}`);
  return asOf;
};

export function createApp(cfg: Config, opts: { webDir?: string } = {}) {
  const db = openSampleDb(cfg.dataDir);
  const outlets = () => dataQuery(cfg, WINDOW.end, db)("outlet_list", {});
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const session = readToken(req.headers.authorization);
    const need = (roles: Role[], outlet?: string) => { const d = deny(session, roles, outlet); if (d) throw new HttpError(...d); };
    try {
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, mode: cfg.mode });
      if (req.method === "GET" && url.pathname === "/outlets") return send(res, 200, await outlets());
      if (req.method === "POST" && url.pathname === "/login") {
        const b = await readJson(req), ids = (await outlets()).map((o) => o.outlet_id as string);
        if (!["customer", "owner", "admin"].includes(b.role)) throw new HttpError(400, 'role must be "customer", "owner" or "admin"');
        // Demo accounts: a customer is scoped to the outlet whose QR they scanned; the demo owner owns every outlet.
        if (b.role === "customer" && !ids.includes(b.outlet_id)) throw new HttpError(400, `A customer picks one outlet: ${ids.join(", ")}`);
        const scope = b.role === "customer" ? [b.outlet_id] : ids;
        return send(res, 200, { token: issueToken(b.role, scope), role: b.role, outlets: scope });
      }
      const outletMatch = url.pathname.match(/^\/outlets\/(OUT-\d{2})\/(availability|reports|owner)$/);
      if (outletMatch) {
        const [, outlet, what] = outletMatch;
        if (req.method === "GET" && what === "availability") {
          need(POLICY.availability, outlet);
          const at = url.searchParams.get("at") ?? undefined, asOf = asOfParam(url);
          if (at && !new RegExp(`^${asOf} \\d{2}:\\d{2}:\\d{2}$`).test(at)) throw new HttpError(400, "at must be a time on the as_of day: YYYY-MM-DD HH:MM:SS");
          return send(res, 200, await availability(cfg, db, outlet, asOf, at));
        }
        if (req.method === "POST" && what === "reports") {
          need(POLICY.report, outlet);
          const b = await readJson(req), asOf = asOfParam(new URL(b.as_of ? `?as_of=${encodeURIComponent(b.as_of)}` : "?", url));
          const machine = (await dataQuery(cfg, asOf, db)("machine_list", { outlet })).find((m) => m.machine_id === b.machine_id);
          if (!machine || !REPORT_REASONS.includes(b.reason)) throw new HttpError(400, `Send {machine_id, reason: ${REPORT_REASONS.join(" | ")}, as_of}`);
          recordReport(cfg, outlet, asOf, machine as any, b.reason);
          return send(res, 200, { ok: true });
        }
        if (req.method === "GET" && what === "owner") { need(POLICY.owner, outlet); return send(res, 200, await ownerView(cfg, db, outlet, asOfParam(url))); }
      }
      if (req.method === "POST" && url.pathname === "/run") {
        need(POLICY.run);
        let body;
        try { body = validateRequest(await readJson(req)); } catch (e) { throw e instanceof HttpError ? e : new HttpError(400, (e as Error).message); }
        need(POLICY.run, body.outlet_id);
        return send(res, 200, await run(body, cfg, { echo: false }));
      }
      if (req.method === "POST" && url.pathname === "/approve") {
        need(POLICY.approve);
        const b = await readJson(req);
        if (typeof b.action_id !== "string" || !["approved", "rejected"].includes(b.decision)) throw new HttpError(400, 'Send {"action_id": "...", "decision": "approved" | "rejected"}');
        const hmem = openHmem(cfg.hmemDir, cfg.logDir);
        const advice = hmem.all().find((m) => m.tags.includes("advice") && m.data.action_id === b.action_id);
        if (advice) need(POLICY.approve, advice.entities[0]);
        try { return send(res, 200, { ok: true, memory: decideAction(hmem, b.action_id, b.decision).content }); }
        catch (e) { throw new HttpError(/No proposed|already decided/.test((e as Error).message) ? 409 : 500, (e as Error).message); }
      }
      const runMatch = url.pathname.match(/^\/runs\/(r-[0-9a-f]{8})$/);
      if (req.method === "GET" && runMatch) {
        need(POLICY.runs);
        const file = (ext: string) => join(cfg.logDir, `${runMatch[1]}${ext}`);
        if (!existsSync(file(".result.json"))) throw new HttpError(404, "No such run");
        const result = JSON.parse(readFileSync(file(".result.json"), "utf8"));
        need(POLICY.runs, result.outlet_id);
        const events = readFileSync(file(".jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
        // The SQL behind each template the run used (the Evidence screen's "Data checked").
        const used = new Set(events.map((e) => e.input_summary?.match(/^template=(\w+)/)?.[1]).filter((n) => n && TEMPLATES[n]));
        const sql = Object.fromEntries([...used].map((n) => [n, cfg.mode.data === "zetaris" ? TEMPLATES[n].lightning : TEMPLATES[n].sqlite]));
        return send(res, 200, { result, events, sql });
      }
      if (req.method === "GET" && url.pathname === "/admin/overview") { need(POLICY.admin); return send(res, 200, await adminOverview(cfg, asOfParam(url), db)); }
      if (req.method === "GET" && url.pathname === "/admin/scope2.csv") { need(POLICY.admin); return send(res, 200, scope2Csv(await adminOverview(cfg, asOfParam(url), db)), "text/csv"); }
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
