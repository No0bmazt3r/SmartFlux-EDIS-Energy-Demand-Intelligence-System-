import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "../config.ts";
import { run } from "./run.ts";

const tmp = mkdtempSync(join(tmpdir(), "sf-run-"));
const cfg = { ...loadConfig({ SAMPLE_MODE: "true" }), logDir: join(tmp, "logs"), hmemDir: join(tmp, "hmem") };
const REQUIRED = ["ts", "run_id", "agent_name", "action", "input_summary", "output_summary", "retry_count", "status", "mode"];

test("tariff run: approved by the Skeptic, logged with every required field", async () => {
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" }, cfg, { echo: false });
  assert.equal(res.decisions.length, 1);
  const events = readFileSync(res.log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  for (const e of events) for (const f of REQUIRED) assert.ok(f in e, `${e.action} lacks ${f}`);
  assert.ok(events.some((e) => e.agent_name === "Skeptic" && e.action === "approve"));
  assert.ok(events.some((e) => e.agent_name === "Skeptic" && e.action === "sqlite.query"), "Skeptic runs its own verification query");
  assert.equal(res.actions[0]?.status ?? "awaiting_approval", "awaiting_approval", "a tariff switch never auto-executes");
});

test("as_of hides later data, so an earlier as_of gives a different answer", async () => {
  const early = await run({ outlet_id: "OUT-01", as_of: "2026-09-13", question: "Should I switch to the ToU tariff?" }, cfg, { echo: false });
  const late = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" }, cfg, { echo: false });
  assert.equal(early.decisions[0].confidence, "low");
  assert.notDeepEqual(early.decisions[0].evidence, late.decisions[0].evidence);
});

test("out-of-scope requests are refused with what it can do", async () => {
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Write me a marketing email" }, cfg, { echo: false });
  assert.equal(res.decisions.length, 0);
  assert.match(res.message ?? "", /can help with/);
});

test("bill investigation: D4 flagged, humidity ruled out by the Skeptic's own peer refit", async () => {
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-04", question: "Why was my bill higher this month?" }, cfg, { echo: false });
  const fault = res.decisions.find((d) => d.type === "machine_fault");
  assert.equal(fault?.verdict, "Service dryer D4");
  assert.equal(res.actions.find((a) => a.type === "schedule_service")?.status, "awaiting_approval");
  const events = readFileSync(res.log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const rejection = events.find((e) => e.agent_name === "Skeptic" && e.status === "needs_revision");
  assert.match(rejection?.output_summary ?? "", /humidity explains a small share/);
  assert.ok(res.decisions.find((d) => d.type === "bill_explanation")!.ruled_out.some((r) => /Humid/.test(r)));
});

test("gas dryer flagged from cycle minutes, answered in Malay, no kWh claim", async () => {
  const res = await run({ outlet_id: "OUT-02", as_of: "2026-10-18", question: "Mesin mana yang rugi?" }, cfg, { echo: false });
  assert.equal(res.decisions.length, 1);
  assert.equal(res.decisions[0].verdict, "Servis pengering G3");
  assert.ok(!res.decisions[0].evidence.some((e) => /kWj setiap kitaran/.test(e)));
});

test("seed 2: the fault moved, and the same code finds it", async () => {
  const seed2 = { ...cfg, dataDir: "data/seed2" };
  const out01 = await run({ outlet_id: "OUT-01", as_of: "2026-10-04", question: "Which machine is wasting money?" }, seed2, { echo: false });
  const out02 = await run({ outlet_id: "OUT-02", as_of: "2026-10-04", question: "Which machine is wasting money?" }, seed2, { echo: false });
  assert.equal(out01.decisions[0].verdict, "No dryer is wasting energy");
  assert.equal(out02.decisions[0].verdict, "Service dryer D2");
});

test("energy plan: the Skeptic rejects the summed saving, the joint plan is solar + flat", async () => {
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Solar, ToU or both?" }, cfg, { echo: false });
  const plan = res.decisions.find((d) => d.type === "energy_plan")!;
  assert.equal(plan.verdict, "Install 10 kWp solar, stay on your current tariff");
  assert.ok(plan.ruled_out.some((r) => /they overlap/.test(r)));
  const events = readFileSync(res.log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.agent_name === "Skeptic" && e.status === "needs_revision" && /overlap/.test(e.output_summary)));
  assert.ok(events.some((e) => e.action === "calc.joint_decision" && e.agent_name === "Investigator"));
  assert.equal(res.actions[0].type, "request_solar_quote");
  assert.equal(res.actions[0].status, "awaiting_approval", "a financial action never auto-executes");
});

test("energy plan without a roof says so plainly", async () => {
  const res = await run({ outlet_id: "OUT-03", as_of: "2026-10-18", question: "Solar, ToU or both?" }, cfg, { echo: false });
  assert.match(res.decisions[0].verdict, /^No roof space for solar: stay/);
  assert.equal(res.actions.length, 0);
});

test("three sessions across restarts: learn, flag and approve, verify, then brief", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sf-sessions-"));
  const c = { ...cfg, hmemDir: join(dir, "hmem"), logDir: join(dir, "logs") };
  const ask = (as_of: string, question?: string) => run({ outlet_id: "OUT-01", as_of, question, briefing: !question }, c, { echo: false });

  const s1 = await ask("2026-09-13", "Which machine is wasting money?");
  assert.match(s1.decisions[0].verdict, /Normal levels learned for 6 dryers/);

  const s2 = await ask("2026-10-04", "Which machine is wasting money?"); // each run() opens memory from disk: a restart
  assert.equal(s2.decisions[0].verdict, "Service dryer D4");
  const s2log = readFileSync(s2.log, "utf8");
  assert.match(s2log, /6 machine baselines \(learned as of 2026-09-13\)/, "session 2 cites the remembered baseline");
  assert.doesNotMatch(s2log, /baseline 7 Sept/, "and does not recompute it");
  const { decideAction } = await import("./memory.ts");
  const { openHmem } = await import("../engines/hmem/index.ts");
  decideAction(openHmem(c.hmemDir, c.logDir), s2.actions[0].id, "approved");

  const s3 = await ask("2026-10-18", "Did servicing D4 work?");
  assert.equal(s3.decisions[0].type, "verification");
  assert.match(s3.decisions[0].verdict, /^Servicing D4 saved RM\d+/);
  assert.ok(!s3.decisions[0].assumptions.some((a) => /re-derived/.test(a)), "prediction came from memory");

  const brief = await ask("2026-10-18");
  assert.equal(brief.decisions[0].type, "briefing");
  assert.ok(brief.decisions[0].evidence.some((e) => /^Servicing D4 saved RM/.test(e)), "briefing reports the remembered outcome");
});

test("asking again while advice awaits approval points at it instead of queuing a copy", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sf-dup-"));
  const c = { ...cfg, hmemDir: join(dir, "hmem"), logDir: join(dir, "logs") };
  const q = { outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" };
  const [a, b] = [await run(q, c, { echo: false }), await run(q, c, { echo: false })];
  assert.equal(b.actions[0].id, a.actions[0].id);
});

test("rejected advice is not proposed again", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sf-reject-"));
  const c = { ...cfg, hmemDir: join(dir, "hmem"), logDir: join(dir, "logs") };
  const q = { outlet_id: "OUT-01", as_of: "2026-10-04", question: "Should I switch to the ToU tariff?" };
  const first = await run(q, c, { echo: false });
  const { decideAction } = await import("./memory.ts");
  const { openHmem } = await import("../engines/hmem/index.ts");
  decideAction(openHmem(c.hmemDir, c.logDir), first.actions[0].id, "rejected");
  const again = await run({ ...q, as_of: "2026-10-18" }, c, { echo: false });
  assert.equal(again.actions.length, 0);
  assert.ok(again.decisions[0].assumptions.some((a) => /You declined/.test(a)));
});

test("promo: advised in session 1, approved, measured in session 2 against the other outlets", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sf-promo-"));
  const c = { ...cfg, hmemDir: join(dir, "hmem"), logDir: join(dir, "logs") };
  const s1 = await run({ outlet_id: "OUT-01", as_of: "2026-09-13", question: "When should I run a promo to shift load off-peak?" }, c, { echo: false });
  assert.equal(s1.decisions[0].type, "load_shift");
  assert.equal(s1.actions[0].type, "run_promo");
  assert.equal(s1.actions[0].status, "awaiting_approval");
  const { decideAction } = await import("./memory.ts");
  const { openHmem } = await import("../engines/hmem/index.ts");
  decideAction(openHmem(c.hmemDir, c.logDir), s1.actions[0].id, "approved");
  const s2 = await run({ outlet_id: "OUT-01", as_of: "2026-10-04", question: "Did the promo help?" }, c, { echo: false });
  assert.equal(s2.decisions.length, 1, "a follow-up does not propose a new promo");
  assert.match(s2.decisions[0].verdict, /promo moved use off-peak/);
});

test("a joint plan that picks solar + flat withdraws the open ToU switch, and ToU is not proposed again on top of it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sf-joint-"));
  const c = { ...cfg, logDir: join(dir, "logs"), hmemDir: join(dir, "hmem") };
  const ask = (as_of: string, question: string) => run({ outlet_id: "OUT-01", as_of, question }, c, { echo: false });
  const tou = await ask("2026-10-04", "Should I switch to the ToU tariff?");
  assert.equal(tou.actions[0]?.type, "switch_tariff");
  const plan = await ask("2026-10-18", "Solar, ToU or both?");
  assert.deepEqual(plan.actions.map((a) => a.type), ["request_solar_quote"]);
  assert.ok(readFileSync(plan.log, "utf8").includes(`Withdrawn: switch_tariff OUT-01`));
  const again = await ask("2026-10-18", "Should I switch to the ToU tariff?");
  assert.equal(again.actions.length, 0);
  assert.equal(again.decisions[0].verdict, "Stay on your current flat tariff");
  assert.match(again.decisions[0].assumptions[0], /solar on the flat tariff/);
});
