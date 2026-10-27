import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { loadConfig } from "./config.ts";
import { startScheduler } from "./scheduler.ts";
import { createApp } from "./server.ts";
import { issueToken } from "./server/auth.ts";

const dir = mkdtempSync(join(tmpdir(), "sf-api-"));
const cfg = { ...loadConfig({ SAMPLE_MODE: "true" }), logDir: join(dir, "logs"), hmemDir: join(dir, "hmem"), usersDb: join(dir, "users.db") };
// A fake Google token endpoint: answers the one code the test uses with an ID token for this app.
const GOOGLE = { GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "secret" };
const idToken = (claims: object) => `x.${Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: GOOGLE.GOOGLE_CLIENT_ID, exp: Date.now() / 1000 + 600, email_verified: true, ...claims })).toString("base64url")}.y`;
const fakeGoogle = (async (_url: string, init: RequestInit) => {
  const code = new URLSearchParams(String(init.body)).get("code");
  if (code === "good") return Response.json({ id_token: idToken({ sub: "g-123", email: "new.person@gmail.com", name: "New Person" }) });
  if (code === "staff") return Response.json({ id_token: idToken({ sub: "g-456", email: "ipoh@smartflux.demo", name: "Hafiz" }) });
  if (code === "other-app") return Response.json({ id_token: idToken({ sub: "g-789", email: "x@gmail.com", aud: "someone-else" }) });
  return new Response("bad code", { status: 400 });
}) as typeof fetch;
const server = createApp(cfg, { env: GOOGLE, fetchImpl: fakeGoogle });
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
after(() => server.close());
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
// The super admin is the business owner (every outlet); the tests below act as them unless they say otherwise.
const owner = issueToken("superadmin", ["OUT-01", "OUT-02", "OUT-03"]), admin = owner;
const auth = (token?: string): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});
const post = (path: string, body: unknown, token: string | undefined = owner) =>
  fetch(base() + path, { method: "POST", headers: { "Content-Type": "application/json", ...auth(token) }, body: JSON.stringify(body) });
const get = (path: string, token: string | undefined = owner) => fetch(base() + path, { headers: auth(token) });
const machine = async (token: string, asOf: string, id: string) =>
  (await (await get(`/outlets/OUT-01/availability?as_of=${asOf}`, token)).json()).machines.find((m: any) => m.machine_id === id);

test("bad requests get a 400 with a message", async () => {
  for (const body of [{}, { outlet_id: "X", as_of: "2026-10-18", question: "hi" }, { outlet_id: "OUT-01", as_of: "2027-01-01", question: "hi" }]) {
    const r = await post("/run", body);
    assert.equal(r.status, 400);
    assert.ok((await r.json()).error);
  }
  assert.equal((await fetch(base() + "/run", { method: "POST", headers: auth(owner), body: "not json" })).status, 400);
  assert.equal((await post("/approve", { action_id: "nope", decision: "approved" })).status, 409);
});

test("roles: each route refuses the wrong role or outlet with a 403, and no token with a 401", async () => {
  const login = await (await post("/login/guest", { outlet_id: "OUT-01" }, "")).json();
  assert.deepEqual(login.outlets, ["OUT-01"]);
  const customer = login.token;
  assert.equal((await post("/login/guest", {}, "")).status, 400, "a guest picks the outlet whose QR they scanned");
  assert.equal((await post("/run", { outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to ToU?" }, customer)).status, 403);
  assert.equal((await post("/approve", { action_id: "x", decision: "approved" }, customer)).status, 403);
  assert.equal((await get("/franchise/overview", customer)).status, 403);
  assert.equal((await get("/outlets/OUT-01/owner", customer)).status, 403);
  assert.equal((await get("/outlets/OUT-02/availability", customer)).status, 403, "a customer sees only their outlet");
  assert.equal((await get("/outlets/OUT-01/availability", customer)).status, 200);
  assert.equal((await get("/outlets/OUT-01/availability", "")).status, 401);
  assert.equal((await get("/outlets/OUT-01/availability", customer + "x")).status, 401, "a tampered token is refused");
  const ownerOf1 = issueToken("admin", ["OUT-01"]);
  assert.equal((await get("/franchise/overview", ownerOf1)).status, 403, "the franchise view is the super admin's");
  assert.equal((await get("/users", ownerOf1)).status, 403, "only the super admin manages people");
  assert.equal((await post("/run", { outlet_id: "OUT-02", as_of: "2026-10-18", question: "Should I switch to ToU?" }, ownerOf1)).status, 403);
  assert.equal((await get("/outlets/OUT-02/owner", ownerOf1)).status, 403);
});

test("customer view: free / in use from the cycle logs, and no energy data", async () => {
  const customer = issueToken("customer", ["OUT-01"]);
  const view = await (await get("/outlets/OUT-01/availability?as_of=2026-10-18&at=2026-10-18%2019:30:00", customer)).json();
  assert.equal(view.machines.length, 14);
  assert.ok(view.machines.some((m: any) => m.status === "in_use" && m.minutes_left > 0) && view.machines.some((m: any) => m.status === "free"));
  assert.ok(view.machines.every((m: any) => !("kwh_per_cycle" in m) && !("health" in m)), "no energy data for customers");
  assert.equal((await get("/outlets/OUT-01/availability?as_of=2026-10-18&at=2026-10-17%2019:30:00", customer)).status, 400);

});

test("run → approve → verify over HTTP, and the run's evidence is readable", async () => {
  const customer = issueToken("customer", ["OUT-01"]);
  await post("/outlets/OUT-01/reports", { machine_id: "OUT-01-D4", reason: "too_long", as_of: "2026-10-02" }, customer);
  const flag = await (await post("/run", { outlet_id: "OUT-01", as_of: "2026-10-04", question: "Which machine is wasting money?" })).json();
  assert.equal(flag.decisions[0].verdict, "Service dryer D4");
  assert.ok(flag.decisions[0].evidence.includes("Customers also reported it (1×: too long)"), "a customer report backs up a meter-based fault");
  assert.notEqual((await machine(customer, "2026-10-04", "OUT-01-D4")).status, "maintenance", "a flag the owner hasn't approved stays hidden");
  const approve = await post("/approve", { action_id: flag.actions[0].id, decision: "approved" });
  assert.equal(approve.status, 200);
  assert.equal((await machine(customer, "2026-10-04", "OUT-01-D4")).status, "maintenance", "approved service shows to customers");
  assert.notEqual((await machine(customer, "2026-10-18", "OUT-01-D4")).status, "maintenance", "cleared once the service log has the work");
  assert.equal((await post("/approve", { action_id: flag.actions[0].id, decision: "approved" })).status, 409, "a decision is recorded once");

  const verify = await (await post("/run", { outlet_id: "OUT-01", as_of: "2026-10-18", question: "Did servicing D4 work?" })).json();
  assert.match(verify.decisions[0].verdict, /^Servicing D4 saved/);

  const evidence = await (await get(`/runs/${flag.run_id}`)).json();
  assert.equal(evidence.result.run_id, flag.run_id);
  assert.match(Object.values(evidence.sql).join("\n"), /FROM/, "the SQL behind each template is returned");
  assert.ok(evidence.events.some((e: any) => e.agent_name === "Skeptic"));
  assert.equal((await get(`/runs/r-00000000`)).status, 404);

  assert.equal((await post("/outlets/OUT-01/reports", { machine_id: "OUT-01-D2", reason: "not_heating", as_of: "2026-10-18" }, customer)).status, 200);
  assert.equal((await post("/outlets/OUT-01/reports", { machine_id: "OUT-02-D2", reason: "not_heating" }, customer)).status, 400);
  const none = await (await post("/run", { outlet_id: "OUT-01", as_of: "2026-10-18", question: "Which machine is wasting money?" })).json();
  assert.equal(none.actions.length, 0, "a report alone never flags a machine");
  assert.ok(none.decisions[0].evidence.some((e: string) => /Customer reports on D2/.test(e)));
  const home = await (await get("/outlets/OUT-01/owner?as_of=2026-10-18")).json();
  assert.deepEqual(home.machines.find((m: any) => m.machine_id === "OUT-01-D2").customer_reports, [{ reason: "not_heating", as_of: "2026-10-18" }]);
  assert.equal(home.machines.find((m: any) => m.machine_id === "OUT-01-D4").health, "serviced_verified");
  assert.ok(home.machines.find((m: any) => m.machine_id === "OUT-01-D4").normal.kwh_per_cycle > 0);
  const d4 = home.machines.find((m: any) => m.machine_id === "OUT-01-D4");
  assert.equal(d4.weekly.length, 6);
  assert.ok(d4.weekly.every((w: any) => w.unit === "kWh" && w.value > 0), "a kWh-per-cycle reading for every week");
  assert.ok(d4.weekly[3].value > d4.weekly[0].value * 1.15 && d4.weekly[5].value < d4.weekly[3].value, "the fault weeks stand out and the service brings it down");
  assert.deepEqual(d4.serviced_on, ["2026-10-06"]);

  const overview = await (await get(`/franchise/overview?as_of=2026-10-18`, admin)).json();
  assert.equal(overview.outlets.length, 3);
  const out01 = overview.outlets.find((o: any) => o.outlet_id === "OUT-01");
  const split = out01.split;
  assert.ok(split.washers_kwh > 0 && split.dryers_kwh > 0 && Math.abs(split.washers_kwh + split.dryers_kwh + split.base_kwh - split.total_kwh) < 1e-6);
  assert.ok(out01.kpis.kwh_month_to_date > 0 && out01.kpis.revenue_rm_month_to_date > 0 && out01.weekly.length === 6);
  assert.equal(overview.advice_scoreboard.find((a: any) => a.target === "OUT-01-D4").verified.verdict, "verified");
  assert.ok(overview.verified_savings_rm_per_month > 0);
  assert.ok(overview.flagged_machines.some((f: any) => f.machine_id === "OUT-01-D4" && /verified/.test(f.status)));
  assert.ok(overview.run_log.length >= 2);
  const csv = await (await get(`/franchise/scope2.csv?as_of=2026-10-18`, admin)).text();
  assert.match(csv.split("\n")[0], /^outlet_id,name,period,grid_kwh/);
  assert.equal(csv.trim().split("\n").length, 4);

  const pipe = await (await get("/franchise/pipeline", admin)).json();
  assert.ok(pipe.totals.runs >= 3 && pipe.totals.sqlite_queries > 0 && pipe.totals.zetaris_queries === 0, "sample mode: every query on local SQLite");
  assert.ok(pipe.agents.find((a: any) => a.agent === "Skeptic").steps > 0);
  const audit = await (await get("/franchise/audit", admin)).json();
  assert.ok(audit.some((e: any) => e.event === "decision" && e.status === "approved" && e.actor === "Owner"), "who approved is recorded");
  assert.ok(audit.some((e: any) => e.event === "advice" && e.actor !== "Owner"));
  assert.ok(audit.some((e: any) => e.event === "customer_report"));
  assert.equal((await get("/franchise/audit", customer)).status, 403);
});

test("a machine flag found in a Malay answer reads in the viewer's language", async () => {
  assert.equal((await post("/run", { outlet_id: "OUT-02", as_of: "2026-10-18", question: "Mesin mana yang rugi?", lang: "ms" })).status, 200);
  const flag = async (lang: string) => (await (await fetch(base() + "/outlets/OUT-02/owner?as_of=2026-10-18", { headers: { ...auth(owner), "Accept-Language": lang } })).json())
    .machines.find((m: any) => m.flag)?.flag;
  assert.equal((await flag("en")).verdict, "Service dryer G3");
  assert.equal((await flag("ms")).verdict, "Servis pengering G3");
});

test("customer view: a promo shows only after the owner approves it", async () => {
  const customer = issueToken("customer", ["OUT-01"]);
  const promo = await (await post("/run", { outlet_id: "OUT-01", as_of: "2026-09-13", question: "When should I run a promo to shift load off-peak?" })).json();
  assert.equal((await (await get("/outlets/OUT-01/availability?as_of=2026-09-13", customer)).json()).promos.length, 0, "not before approval");
  await post("/approve", { action_id: promo.actions[0].id, decision: "approved" });
  assert.equal((await (await get("/outlets/OUT-01/availability?as_of=2026-09-13", customer)).json()).promos[0].slot, promo.actions[0].target);
});

test("accounts: sign-in with a hashed password, sign-up, lockout after five wrong passwords", async () => {
  const ok = await post("/login", { email: "OWNER@smartflux.demo", password: "smartflux-demo" }, "");
  assert.equal(ok.status, 200);
  const s = await ok.json();
  assert.equal(s.role, "superadmin");
  assert.deepEqual(s.outlets, ["OUT-01", "OUT-02", "OUT-03"]);
  assert.equal((await (await get("/me", s.token)).json()).email, "owner@smartflux.demo");
  assert.equal((await post("/login", { email: "owner@smartflux.demo", password: "wrong-password" }, "")).status, 401);
  assert.equal((await post("/login", { email: "nobody@x.com", password: "smartflux-demo" }, "")).status, 401, "same answer for an unknown email");

  const demo = await (await post("/login/demo", { email: "ipoh@smartflux.demo" }, "")).json();
  assert.deepEqual([demo.role, demo.outlets], ["admin", ["OUT-01"]], "one click into a demo account, no password");
  assert.equal((await post("/login/demo", { email: "siti@example.com" }, "")).status, 404, "only the demo accounts");

  const up = await post("/signup", { name: "Siti", email: "siti@example.com", password: "longenough" }, "");
  assert.equal(up.status, 201);
  assert.equal((await up.json()).role, "customer", "sign-up always makes a customer");
  assert.equal((await post("/signup", { name: "Siti", email: "SITI@example.com", password: "longenough" }, "")).status, 409);
  assert.equal((await post("/signup", { name: "Short", email: "short@example.com", password: "123" }, "")).status, 400);
  assert.equal((await post("/signup", { name: "Sneaky", email: "sneaky@example.com", password: "longenough", role: "superadmin" }, "")).status === 201 &&
    (await (await post("/login", { email: "sneaky@example.com", password: "longenough" }, "")).json()).role, "customer", "a role in the sign-up body is ignored");

  for (let i = 0; i < 5; i++) await post("/login", { email: "customer@smartflux.demo", password: "guess-" + i }, "");
  assert.equal((await post("/login", { email: "customer@smartflux.demo", password: "smartflux-demo" }, "")).status, 429, "locked after five wrong passwords");

  const { DatabaseSync } = await import("node:sqlite");
  const hash = (new DatabaseSync(cfg.usersDb).prepare("SELECT password_hash FROM users WHERE email = 'siti@example.com'").get() as any).password_hash;
  assert.match(hash, /^scrypt\$/);
  assert.ok(!hash.includes("longenough"), "only the hash is stored");
});

test("people: the super admin adds an admin for one franchise outlet; changes apply to live tokens", async () => {
  const boss = (await (await post("/login", { email: "owner@smartflux.demo", password: "smartflux-demo" }, "")).json()).token;
  const add = await post("/users", { name: "Kumar", email: "kumar@franchise.my", role: "admin", outlets: ["OUT-02"], password: "franchise-2" }, boss);
  assert.equal(add.status, 201);
  const kumar = await add.json();
  assert.equal((await post("/users", { name: "X", email: "x@franchise.my", role: "admin", outlets: [] }, boss)).status, 400, "an admin needs an outlet");
  assert.equal((await post("/users", { name: "X", email: "x@franchise.my", role: "admin", outlets: ["OUT-99"] }, boss)).status, 400);

  const k = (await (await post("/login", { email: "kumar@franchise.my", password: "franchise-2" }, "")).json()).token;
  assert.equal((await get("/outlets/OUT-02/owner?as_of=2026-10-18", k)).status, 200);
  assert.equal((await get("/outlets/OUT-01/owner?as_of=2026-10-18", k)).status, 403, "only the outlet they were given");
  assert.equal((await get("/users", k)).status, 403);

  const moved = await fetch(`${base()}/users/${kumar.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...auth(boss) }, body: JSON.stringify({ outlets: ["OUT-01"] }) });
  assert.deepEqual((await moved.json()).outlets, ["OUT-01"]);
  assert.equal((await get("/outlets/OUT-02/owner?as_of=2026-10-18", k)).status, 403, "the old token loses OUT-02 at once");

  const me = (await (await get("/me", boss)).json());
  assert.equal((await fetch(`${base()}/users/${me.uid}`, { method: "DELETE", headers: auth(boss) })).status, 400, "no deleting yourself");
  assert.equal((await fetch(`${base()}/users/${me.uid}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...auth(boss) }, body: JSON.stringify({ role: "admin", outlets: ["OUT-01"] }) })).status, 400);
  assert.equal((await fetch(`${base()}/users/${kumar.id}`, { method: "DELETE", headers: auth(boss) })).status, 200);
  assert.equal((await get("/outlets/OUT-01/owner?as_of=2026-10-18", k)).status, 401, "a removed account's token stops working");
});

test("Google sign-in: state cookie checked, claims checked, new emails become customers, staff accounts link", async () => {
  assert.equal((await (await get("/auth/config", "")).json()).google, true);
  const start = await fetch(`${base()}/auth/google`, { redirect: "manual" });
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get("location")!), state = to.searchParams.get("state")!;
  assert.equal(to.searchParams.get("client_id"), GOOGLE.GOOGLE_CLIENT_ID);
  assert.match(start.headers.get("set-cookie")!, /HttpOnly/);
  const callback = (code: string, cookieState = state) =>
    fetch(`${base()}/auth/google/callback?code=${code}&state=${state}`, { redirect: "manual", headers: { Cookie: `sf_oauth_state=${cookieState}` } });
  const token = (r: Response) => new URLSearchParams(new URL(r.headers.get("location")!, base()).hash.slice(1)).get("token");

  assert.equal(token(await callback("good", "forged")), null, "a callback this browser didn't start is refused");
  assert.equal(token(await callback("other-app")), null, "a token for another app is refused");
  const fresh = token(await callback("good"))!;
  const me = await (await get("/me", fresh)).json();
  assert.deepEqual([me.email, me.role], ["new.person@gmail.com", "customer"]);
  const staff = await (await get("/me", token(await callback("staff"))!)).json();
  assert.deepEqual([staff.email, staff.role, staff.outlets], ["ipoh@smartflux.demo", "admin", ["OUT-01"]], "links to the account the super admin made");
});

test("the scheduler briefs every outlet on Monday 08:00 Malaysia time, once", async () => {
  const before = readdirSync(cfg.logDir).filter((f) => f.endsWith(".result.json")).length;
  const s = startScheduler(cfg, () => new Date("2026-10-19T00:05:00Z")); // Mon 19 Oct, 08:05 MYT
  await s.tick();
  await s.tick();
  s.stop();
  assert.equal(readdirSync(cfg.logDir).filter((f) => f.endsWith(".result.json")).length - before, 3);
});
