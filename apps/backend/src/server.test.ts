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
const cfg = { ...loadConfig({ SAMPLE_MODE: "true" }), logDir: join(dir, "logs"), hmemDir: join(dir, "hmem") };
const server = createApp(cfg);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
after(() => server.close());
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const owner = issueToken("owner", ["OUT-01", "OUT-02", "OUT-03"]), admin = issueToken("admin", ["OUT-01", "OUT-02", "OUT-03"]);
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
  const login = await (await post("/login", { role: "customer", outlet_id: "OUT-01" }, "")).json();
  assert.deepEqual(login.outlets, ["OUT-01"]);
  const customer = login.token;
  assert.equal((await post("/login", { role: "customer" }, "")).status, 400, "a customer must pick an outlet");
  assert.equal((await post("/run", { outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to ToU?" }, customer)).status, 403);
  assert.equal((await post("/approve", { action_id: "x", decision: "approved" }, customer)).status, 403);
  assert.equal((await get("/admin/overview", customer)).status, 403);
  assert.equal((await get("/outlets/OUT-01/owner", customer)).status, 403);
  assert.equal((await get("/outlets/OUT-02/availability", customer)).status, 403, "a customer sees only their outlet");
  assert.equal((await get("/outlets/OUT-01/availability", customer)).status, 200);
  assert.equal((await get("/outlets/OUT-01/availability", "")).status, 401);
  assert.equal((await get("/outlets/OUT-01/availability", customer + "x")).status, 401, "a tampered token is refused");
  assert.equal((await get("/admin/overview", owner)).status, 403);
  assert.equal((await post("/approve", { action_id: "x", decision: "approved" }, admin)).status, 403, "only the owner decides");
  const ownerOf1 = issueToken("owner", ["OUT-01"]);
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

  const overview = await (await get(`/admin/overview?as_of=2026-10-18`, admin)).json();
  assert.equal(overview.outlets.length, 3);
  const out01 = overview.outlets.find((o: any) => o.outlet_id === "OUT-01");
  assert.ok(out01.kpis.kwh_month_to_date > 0 && out01.kpis.revenue_rm_month_to_date > 0 && out01.weekly.length === 6);
  assert.equal(overview.advice_scoreboard.find((a: any) => a.target === "OUT-01-D4").verified.verdict, "verified");
  assert.ok(overview.verified_savings_rm_per_month > 0);
  assert.ok(overview.flagged_machines.some((f: any) => f.machine_id === "OUT-01-D4" && /verified/.test(f.status)));
  assert.ok(overview.run_log.length >= 2);
  const csv = await (await get(`/admin/scope2.csv?as_of=2026-10-18`, admin)).text();
  assert.match(csv.split("\n")[0], /^outlet_id,name,period,grid_kwh/);
  assert.equal(csv.trim().split("\n").length, 4);
});

test("customer view: a promo shows only after the owner approves it", async () => {
  const customer = issueToken("customer", ["OUT-01"]);
  const promo = await (await post("/run", { outlet_id: "OUT-01", as_of: "2026-09-13", question: "When should I run a promo to shift load off-peak?" })).json();
  assert.equal((await (await get("/outlets/OUT-01/availability?as_of=2026-09-13", customer)).json()).promos.length, 0, "not before approval");
  await post("/approve", { action_id: promo.actions[0].id, decision: "approved" });
  assert.equal((await (await get("/outlets/OUT-01/availability?as_of=2026-09-13", customer)).json()).promos[0].slot, promo.actions[0].target);
});

test("the scheduler briefs every outlet on Monday 08:00 Malaysia time, once", async () => {
  const before = readdirSync(cfg.logDir).filter((f) => f.endsWith(".result.json")).length;
  const s = startScheduler(cfg, () => new Date("2026-10-19T00:05:00Z")); // Mon 19 Oct, 08:05 MYT
  await s.tick();
  await s.tick();
  s.stop();
  assert.equal(readdirSync(cfg.logDir).filter((f) => f.endsWith(".result.json")).length - before, 3);
});
