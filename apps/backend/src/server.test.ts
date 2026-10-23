import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { loadConfig } from "./config.ts";
import { startScheduler } from "./scheduler.ts";
import { createApp } from "./server.ts";

const dir = mkdtempSync(join(tmpdir(), "sf-api-"));
const cfg = { ...loadConfig({ SAMPLE_MODE: "true" }), logDir: join(dir, "logs"), hmemDir: join(dir, "hmem") };
const server = createApp(cfg);
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
after(() => server.close());
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (path: string, body: unknown) => fetch(base() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("bad requests get a 400 with a message", async () => {
  for (const body of [{}, { outlet_id: "X", as_of: "2026-10-18", question: "hi" }, { outlet_id: "OUT-01", as_of: "2027-01-01", question: "hi" }]) {
    const r = await post("/run", body);
    assert.equal(r.status, 400);
    assert.ok((await r.json()).error);
  }
  assert.equal((await fetch(base() + "/run", { method: "POST", body: "not json" })).status, 400);
  assert.equal((await post("/approve", { action_id: "nope", decision: "approved" })).status, 409);
});

test("run → approve → verify over HTTP, and the run's evidence is readable", async () => {
  const flag = await (await post("/run", { outlet_id: "OUT-01", as_of: "2026-10-04", question: "Which machine is wasting money?" })).json();
  assert.equal(flag.decisions[0].verdict, "Service dryer D4");
  const approve = await post("/approve", { action_id: flag.actions[0].id, decision: "approved" });
  assert.equal(approve.status, 200);
  assert.equal((await post("/approve", { action_id: flag.actions[0].id, decision: "approved" })).status, 409, "a decision is recorded once");

  const verify = await (await post("/run", { outlet_id: "OUT-01", as_of: "2026-10-18", question: "Did servicing D4 work?" })).json();
  assert.match(verify.decisions[0].verdict, /^Servicing D4 saved/);

  const evidence = await (await fetch(`${base()}/runs/${flag.run_id}`)).json();
  assert.equal(evidence.result.run_id, flag.run_id);
  assert.ok(evidence.events.some((e: any) => e.agent_name === "Skeptic"));
  assert.equal((await fetch(`${base()}/runs/r-00000000`)).status, 404);

  const admin = await (await fetch(`${base()}/admin/overview?as_of=2026-10-18`)).json();
  assert.equal(admin.outlets.length, 3);
  const out01 = admin.outlets.find((o: any) => o.outlet_id === "OUT-01");
  assert.ok(out01.kpis.kwh_month_to_date > 0 && out01.kpis.revenue_rm_month_to_date > 0 && out01.weekly.length === 6);
  assert.equal(admin.advice_scoreboard.find((a: any) => a.target === "OUT-01-D4").verified.verdict, "verified");
  assert.ok(admin.verified_savings_rm_per_month > 0);
  assert.ok(admin.flagged_machines.some((f: any) => f.machine_id === "OUT-01-D4" && /verified/.test(f.status)));
  assert.ok(admin.run_log.length >= 2);
  const csv = await (await fetch(`${base()}/admin/scope2.csv?as_of=2026-10-18`)).text();
  assert.match(csv.split("\n")[0], /^outlet_id,name,period,grid_kwh/);
  assert.equal(csv.trim().split("\n").length, 4);
});

test("the scheduler briefs every outlet on Monday 08:00 Malaysia time, once", async () => {
  const before = readdirSync(cfg.logDir).filter((f) => f.endsWith(".result.json")).length;
  const s = startScheduler(cfg, () => new Date("2026-10-19T00:05:00Z")); // Mon 19 Oct, 08:05 MYT
  await s.tick();
  await s.tick();
  s.stop();
  assert.equal(readdirSync(cfg.logDir).filter((f) => f.endsWith(".result.json")).length - before, 3);
});
