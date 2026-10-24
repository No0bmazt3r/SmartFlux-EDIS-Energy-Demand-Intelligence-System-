// HTTP API on 0.0.0.0:8000 (PRD FR-70 to FR-74), plain node:http. Also serves the built web app, if present,
// and runs the weekly briefing scheduler.
//   POST /run              {outlet_id, as_of, question?, lang?, briefing?} → decisions, actions, unresolved, log
//   POST /approve          {action_id, decision: "approved" | "rejected"}
//   GET  /runs/:id         the stored result and every log event of one run (the Evidence screen)
//   GET  /franchise/overview ?as_of=YYYY-MM-DD   all-outlet view (super admin);   GET /franchise/scope2.csv?as_of=...
//   POST /login {email, password} · POST /signup {name, email, password} · POST /login/guest {outlet_id} → signed token
//   GET  /auth/config · GET /auth/google → Google → GET /auth/google/callback · GET /me
//   GET|POST /users · PATCH|DELETE /users/:id   the People screen (super admin)
//   GET  /outlets   names for the sign-in screen
//   GET  /outlets/:id/availability ?as_of&at   customer view;   POST /outlets/:id/reports {machine_id, reason, as_of}
//   GET  /outlets/:id/owner ?as_of             owner home, machines, approvals
//   GET  /health
// Every route except /health, sign-in and /outlets needs a token; roles and outlet scope per server/auth.ts.
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
import { deny, issueToken, lockedOut, noteLogin, POLICY, readToken, type Role } from "./server/auth.ts";
import { cookie, googleConfig, googleFinish, googleStart, STATE_COOKIE } from "./server/google.ts";
import { openUsers, seedUsers, UserError, type User } from "./server/users.ts";
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

export function createApp(cfg: Config, opts: { webDir?: string; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}) {
  const env = opts.env ?? process.env;
  const db = openSampleDb(cfg.dataDir);
  const outlets = () => dataQuery(cfg, WINDOW.end, db)("outlet_list", {});
  const users = openUsers(cfg.usersDb), google = googleConfig(env), sample = cfg.mode.data === "local";
  const ids = outlets().then((o) => o.map((x) => x.outlet_id as string));
  const seeded = ids.then((all) => seedUsers(users, all, env, sample));
  const signedIn = (u: User) => ({ token: issueToken(u.role, u.outlets, u.id), role: u.role, outlets: u.outlets, name: u.name, email: u.email });
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    await seeded;
    const session = readToken(req.headers.authorization, users);
    const need = (roles: Role[], outlet?: string) => { const d = deny(session, roles, outlet); if (d) throw new HttpError(...d); };
    try {
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, mode: cfg.mode });
      if (req.method === "GET" && url.pathname === "/outlets") return send(res, 200, await outlets());
      if (req.method === "POST" && url.pathname === "/login") {
        const b = await readJson(req), email = String(b.email ?? "");
        if (lockedOut(email)) throw new HttpError(429, "Too many wrong passwords. Try again in 15 minutes.");
        const u = users.check(email, String(b.password ?? ""));
        noteLogin(email, !!u);
        if (!u) throw new HttpError(401, "Wrong email or password");
        return send(res, 200, signedIn(u));
      }
      if (req.method === "POST" && url.pathname === "/signup") {
        const b = await readJson(req);
        return send(res, 201, signedIn(users.create({ name: b.name, email: b.email, password: b.password ?? "", role: "customer" }, await ids)));
      }
      // The QR code at an outlet: a customer can see that outlet's machines without an account.
      if (req.method === "POST" && url.pathname === "/login/guest") {
        const b = await readJson(req), all = await ids;
        if (!all.includes(b.outlet_id)) throw new HttpError(400, `Pick an outlet: ${all.join(", ")}`);
        return send(res, 200, { token: issueToken("customer", [b.outlet_id]), role: "customer", outlets: [b.outlet_id], name: "Guest" });
      }
      if (req.method === "GET" && url.pathname === "/me") { need(POLICY.me); return send(res, 200, { ...session, exp: undefined }); }
      if (req.method === "GET" && url.pathname === "/auth/config") {
        const demo = sample ? users.list().filter((u) => u.email.endsWith("@smartflux.demo")) : [];
        return send(res, 200, { google: !!google, demo: demo.length ? { password: env.DEMO_PASSWORD ? null : "smartflux-demo", accounts: demo.map((u) => ({ email: u.email, role: u.role, name: u.name })) } : null });
      }
      if (req.method === "GET" && url.pathname === "/auth/google") {
        if (!google) throw new HttpError(404, "Google sign-in is not configured (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)");
        const s = googleStart(google);
        res.writeHead(302, { Location: s.url, "Set-Cookie": s.cookie }).end();
        return;
      }
      if (req.method === "GET" && url.pathname === "/auth/google/callback") {
        const back = (hash: string) => res.writeHead(302, { Location: `/login#${hash}`, "Set-Cookie": `${STATE_COOKIE}=; Path=/auth; Max-Age=0` }).end();
        const state = url.searchParams.get("state"), code = url.searchParams.get("code");
        if (!google || !code || !state || state !== cookie(req.headers.cookie, STATE_COOKIE)) return back("error=Google%20sign-in%20failed.%20Try%20again.");
        try {
          const u = users.google(await googleFinish(google, code, opts.fetchImpl), await ids);
          return back(`token=${signedIn(u).token}`);
        } catch (e) { return back(`error=${encodeURIComponent((e as Error).message)}`); }
      }
      if (url.pathname === "/users" || /^\/users\/\d+$/.test(url.pathname)) {
        need(POLICY.people);
        const id = Number(url.pathname.split("/")[2]);
        if (req.method === "GET" && !id) return send(res, 200, users.list());
        if (req.method === "POST" && !id) return send(res, 201, users.create(await readJson(req), await ids, session!.uid));
        if (req.method === "PATCH" && id) return send(res, 200, users.update(id, await readJson(req), await ids, session!.uid ?? -1));
        if (req.method === "DELETE" && id) { users.remove(id, session!.uid ?? -1); return send(res, 200, { ok: true }); }
        throw new HttpError(405, "Method not allowed");
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
      if (req.method === "GET" && url.pathname === "/franchise/overview") { need(POLICY.franchise); return send(res, 200, await adminOverview(cfg, asOfParam(url), db)); }
      if (req.method === "GET" && url.pathname === "/franchise/scope2.csv") { need(POLICY.franchise); return send(res, 200, scope2Csv(await adminOverview(cfg, asOfParam(url), db)), "text/csv"); }
      if (req.method === "GET" && opts.webDir && existsSync(opts.webDir)) {
        const safe = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
        const path = join(opts.webDir, safe);
        const file = path.startsWith(opts.webDir) && existsSync(path) && statSync(path).isFile() ? path : join(opts.webDir, "index.html"); // SPA routes
        return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? "application/octet-stream");
      }
      throw new HttpError(404, "Not found");
    } catch (e) {
      const status = e instanceof HttpError || e instanceof UserError ? e.status : 500;
      send(res, status, { error: (e as Error).message });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  createApp(cfg, { webDir: process.env.WEB_DIR ?? "apps/frontend/dist" }).listen(cfg.port, "0.0.0.0", () => {
    console.log(`SmartFlux API on http://0.0.0.0:${cfg.port} (data: ${cfg.mode.data}, reasoning: ${cfg.mode.llm})`);
    if (process.env.BRIEFING_SCHEDULER !== "off") startScheduler(cfg);
  }).on("error", (e: NodeJS.ErrnoException) => {
    if (e.code !== "EADDRINUSE") throw e;
    console.error(`Port ${cfg.port} is already in use, probably by another SmartFlux server (pnpm start / demo / dev). Stop it with Ctrl+C, or run with PORT=8001.`);
    process.exit(1);
  });
}
