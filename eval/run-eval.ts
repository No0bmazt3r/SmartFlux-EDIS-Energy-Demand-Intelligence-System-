// pnpm eval: the objective checks (docs/data-and-evaluation.md §6) on seed 1 and seed 2, in sample mode with an
// empty .env, plus the log assertions and the anti-overfitting grep. Only this file reads manifest.json.
// Writes eval/report.md; exits non-zero if any check fails.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSampleDb } from "../apps/backend/src/adapters/local-sqlite.ts";
import { regressMachines } from "../apps/backend/src/calc/regress.ts";
import { ratesFromRows, touCalc, weeksFromRows } from "../apps/backend/src/calc/tou.ts";
import { loadConfig } from "../apps/backend/src/config.ts";
import { openHmem } from "../apps/backend/src/engines/hmem/index.ts";
import { decideAction } from "../apps/backend/src/orchestrator/memory.ts";
import { run } from "../apps/backend/src/orchestrator/run.ts";
import type { RunRequest } from "../apps/backend/src/orchestrator/state.ts";
import { addDays, ts } from "../apps/backend/src/orchestrator/windows.ts";
import { querySqlite } from "../apps/backend/src/templates/index.ts";

type Check = { seed: number | "-"; id: string; name: string; pass: boolean; detail: string };
const checks: Check[] = [];
const record = (seed: Check["seed"], id: string, name: string, pass: boolean, detail: string) => checks.push({ seed, id, name, pass, detail });
const REQUIRED = ["ts", "run_id", "agent_name", "action", "input_summary", "output_summary", "retry_count", "status", "mode"];
const OUTLETS = ["OUT-01", "OUT-02", "OUT-03"];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

async function seedChecks(seed: number, dataDir: string) {
  const manifest = JSON.parse(readFileSync(join(dataDir, "manifest.json"), "utf8"));
  const db = openSampleDb(dataDir);
  const fresh = () => { const d = mkdtempSync(join(tmpdir(), `sf-eval-${seed}-`)); return { ...loadConfig({}), dataDir, logDir: join(d, "logs"), hmemDir: join(d, "hmem") }; };
  const runs: { req: RunRequest; res: any; rec: any; events: any[] }[] = [];
  const ask = async (cfg: ReturnType<typeof fresh>, req: RunRequest) => {
    const res = await run(req, cfg, { echo: false });
    const rec = JSON.parse(readFileSync(join(cfg.logDir, `${res.run_id}.result.json`), "utf8"));
    const events = readFileSync(res.log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    runs.push({ req, res, rec, events });
    return { res, rec, events };
  };
  const machines = db.prepare("SELECT machine_id, outlet_id, type, heat_source, name FROM machines").all() as any[];

  // O1: tariff verdict matches the calculator on the true data, and the worst week is reported.
  const o1: string[] = [];
  for (const outlet of OUTLETS) {
    const truth = touCalc(weeksFromRows(querySqlite(db, "tou_split", { outlet, from: ts("2026-09-07"), to: ts("2026-10-19") }, "2026-10-18") as any),
      ratesFromRows(querySqlite(db, "tariff_rates", { outlet }, "2026-10-18") as any));
    const { res, rec } = await ask(fresh(), { outlet_id: outlet, as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" });
    const got = rec.findings.find((f: any) => f.kind === "tou")?.data.verdict;
    if (got !== truth.verdict || !res.decisions[0]?.evidence.some((e: string) => /Worst week/.test(e))) o1.push(`${outlet}: got ${got}, truth ${truth.verdict}`);
  }
  record(seed, "O1", "ToU verdicts match the calculator", !o1.length, o1.join("; ") || "3/3 outlets");

  // O2: weekly regression recovers each electric dryer's planted kWh/cycle within ±10% (humidity and fault applied).
  const weather = readFileSync(join(dataDir, "weather.csv"), "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
  const errs: number[] = [];
  const o2: string[] = [];
  for (const outlet of OUTLETS) {
    const rh = weather.filter((w) => w[0] === outlet).map((w) => Number(w[4]));
    const mean = rh.reduce((s, v) => s + v, 0) / rh.length;
    const weekRh = [0, 1, 2, 3, 4, 5].map((w) => rh.slice(w * 168, w * 168 + 168).reduce((s, v) => s + v, 0) / 168);
    const humidWeek = weekRh.indexOf(Math.max(...weekRh)) + 1;
    const ids = machines.filter((m) => m.outlet_id === outlet).map((m) => m.machine_id);
    for (let w = 1; w <= 6; w++) {
      const from = addDays("2026-09-07", 7 * (w - 1)), to = addDays(from, 7);
      const fit = regressMachines(querySqlite(db, "interval_series", { outlet, from: ts(from), to: ts(to) }, "2026-10-18") as any,
        querySqlite(db, "cycle_overlap", { outlet, from: ts(from), to: ts(to) }, "2026-10-18") as any, ids);
      for (const m of machines.filter((x) => x.outlet_id === outlet && x.type === "dryer" && x.heat_source === "electric")) {
        const base = manifest.machines.find((x: any) => x.machine_id === m.machine_id).kwh_per_cycle_before_humidity;
        const fault = manifest.plants.find((p: any) => `${p.outlet_id}-${p.machine}` === m.machine_id && p.onset_week);
        if (fault?.serviced_on && from < fault.serviced_on && to > fault.serviced_on) continue; // service week mixes two levels
        const level = fault?.serviced_on && from >= fault.serviced_on ? (seed === 1 ? 2.15 : 2.1) : fault && w >= fault.onset_week ? base * (1 + fault.kwh_pct) : base;
        // The generator applies humidity per cycle, at the hour it starts: average that factor over this dryer's cycles.
        const starts = (querySqlite(db, "cycle_duration", { machine: m.machine_id, from: ts(from), to: ts(to) }, "2026-10-18") as any[]).map((c) => c.started_at);
        const hourIdx = (s: string) => Math.min(rh.length - 1, Math.floor((Date.parse(s.replace(" ", "T") + "Z") - Date.parse("2026-09-07T00:00:00Z")) / 3600_000));
        const humid = starts.reduce((s, x) => s + 1 + 0.004 * (rh[hourIdx(x)] - mean), 0) / (starts.length || 1) + (w === humidWeek ? 0.04 : 0);
        const expected = level * humid;
        const got = fit.machines.find((x) => x.machine_id === m.machine_id)!.kwh_per_cycle;
        const err = got / expected - 1;
        errs.push(Math.abs(err));
        if (Math.abs(err) > 0.1) o2.push(`${m.machine_id} week ${w}: ${got.toFixed(2)} vs ${expected.toFixed(2)} (${pct(err)})`);
      }
    }
  }
  record(seed, "O2", "Regression within ±10% for every electric dryer, every week", !o2.length,
    `${errs.length - o2.length}/${errs.length} within ±10%, median error ${pct(errs.sort((a, b) => a - b)[errs.length >> 1])}${o2.length ? `; misses: ${o2.join("; ")}` : ""}`);

  // O3 + O11: every planted fault is flagged in at least one session; nothing else is ever flagged; gas faults by minutes only.
  const planted = manifest.plants.filter((p: any) => p.onset_week).map((p: any) => ({ id: `${p.outlet_id}-${p.machine}`, gas: p.heat_source === "gas" }));
  const flagged = new Map<string, any[]>();
  for (const outlet of OUTLETS) for (const as_of of ["2026-10-04", "2026-10-18"]) {
    const { res, rec } = await ask(fresh(), { outlet_id: outlet, as_of, question: "Which machine is wasting money?" });
    for (const f of rec.findings.filter((x: any) => x.kind === "fault" && x.data.machine_id))
      flagged.set(f.data.machine_id, [...(flagged.get(f.data.machine_id) ?? []), { f, card: res.decisions.find((d: any) => d.verdict.endsWith(` ${f.data.name}`)) }]);
  }
  const missed = planted.filter((p: any) => !flagged.has(p.id)).map((p: any) => p.id);
  const false_ = [...flagged.keys()].filter((id) => !planted.some((p: any) => p.id === id));
  record(seed, "O3", "Planted faults flagged; humid week, holiday and noisy washer not flagged", !missed.length && !false_.length,
    `flagged ${[...flagged.keys()].join(", ") || "none"}${missed.length ? `; missed ${missed.join(", ")}` : ""}${false_.length ? `; false flags ${false_.join(", ")}` : ""}`);
  const gasBad = planted.filter((p: any) => p.gas).flatMap((p: any) => (flagged.get(p.id) ?? []).filter((x) => x.f.data.metric !== "minutes_per_cycle" || x.card?.evidence.some((e: string) => /kWh per cycle/.test(e))).map(() => p.id));
  const gasPlanted = planted.filter((p: any) => p.gas);
  record(seed, "O11", "Gas dryer faults found from cycle minutes, no kWh claim", gasPlanted.every((p: any) => flagged.has(p.id)) && !gasBad.length,
    gasPlanted.length ? gasPlanted.map((p: any) => `${p.id}: ${flagged.get(p.id)?.[0]?.f.data.metric ?? "not flagged"}`).join("; ") : "no gas fault planted");

  // O9: energy plan picks the cheapest of the four options; a summed ToU + solar saving is rejected in the log.
  const o9: string[] = [];
  for (const outlet of OUTLETS) {
    const { rec, events } = await ask(fresh(), { outlet_id: outlet, as_of: "2026-10-18", question: "Solar, ToU or both?" });
    const e = rec.findings.find((f: any) => f.kind === "energy")?.data;
    if (!e) { o9.push(`${outlet}: no approved plan`); continue; }
    if (e.composition === "joint") {
      const opts = rec.findings.find((f: any) => f.kind === "energy").data.joint;
      const rejected = events.some((x) => x.agent_name === "Skeptic" && x.status === "needs_revision");
      if (!rejected) o9.push(`${outlet}: no Skeptic rejection of the summed plan`);
      if (!opts.best) o9.push(`${outlet}: no best option`);
    }
  }
  record(seed, "O9", "Joint energy decision; summed savings rejected", !o9.length, o9.join("; ") || "3/3 outlets (no-roof outlets answered grid-only)");

  // O10: verified saving per cycle within ±15% of the planted recovery (service-log path, fresh memory).
  const o10: string[] = [];
  for (const p of manifest.plants.filter((x: any) => x.serviced_on && x.heat_source === "electric")) {
    const id = `${p.outlet_id}-${p.machine}`;
    const base = manifest.machines.find((x: any) => x.machine_id === id).kwh_per_cycle_before_humidity;
    const planted = base * (1 + p.kwh_pct) - (seed === 1 ? 2.15 : 2.1);
    const { rec } = await ask(fresh(), { outlet_id: p.outlet_id, as_of: "2026-10-18", question: `Did servicing ${p.machine} work?` });
    const v = rec.findings.find((f: any) => f.kind === "verify" && f.data.machine_id === id)?.data;
    const got = v?.mv?.realised_per_cycle;
    const err = got === undefined ? Infinity : got / planted - 1;
    if (!(Math.abs(err) <= 0.15) || v.mv.verdict !== "verified") o10.push(`${id}: realised ${got?.toFixed(2)} vs planted ${planted.toFixed(2)} kWh/cycle (${Number.isFinite(err) ? pct(err) : "none"}), ${v?.mv?.verdict}`);
    else o10.push(`${id}: ${got.toFixed(2)} vs ${planted.toFixed(2)} (${pct(err)}) ✓`);
  }
  record(seed, "O10", "Realised saving within ±15% of planted", o10.every((x) => x.endsWith("✓")), o10.join("; "));

  // O5: memory across sessions (baselines and the promo outcome), on a fresh store, each run a restart.
  const mem = fresh();
  await ask(mem, { outlet_id: "OUT-01", as_of: "2026-09-13", question: "Which machine is wasting money?" });
  const promo = await ask(mem, { outlet_id: "OUT-01", as_of: "2026-09-13", question: "When should I run a promo to shift load off-peak?" });
  decideAction(openHmem(mem.hmemDir, mem.logDir), promo.res.actions[0].id, "approved");
  const s2 = await ask(mem, { outlet_id: "OUT-01", as_of: "2026-10-04", question: "Which machine is wasting money?" });
  const s2b = await ask(mem, { outlet_id: "OUT-01", as_of: "2026-10-04", question: "Did the promo help?" });
  const citesBaseline = s2.events.some((e) => e.agent_name === "H-MEM" && /learned as of 2026-09-13/.test(e.output_summary));
  const promoOutcome = s2b.rec.findings.find((f: any) => f.kind === "verify" && f.data.promo)?.data.result;
  record(seed, "O5", "Session 2 recalls session 1 baselines; promo outcome reported", citesBaseline && !!promoOutcome,
    `baseline recalled: ${citesBaseline}; promo: ${promoOutcome ? `${promoOutcome.verdict}, ${promoOutcome.offpeak_share_change_pts.toFixed(1)} pts vs other outlets` : "not reported"}`);

  // O7: the eight examples run with an empty .env and give different outputs.
  const ex = fresh();
  const outs: string[] = [];
  for (const f of readdirSync("input_examples").sort()) {
    const { res } = await ask(ex, JSON.parse(readFileSync(join("input_examples", f), "utf8")));
    outs.push(JSON.stringify(res.decisions.map((d: any) => d.verdict)) + (res.message ?? ""));
  }
  record(seed, "O7", "Examples run with an empty .env and give different outputs", new Set(outs).size === outs.length, `${new Set(outs).size}/${outs.length} distinct`);

  // O4, O6 and the log assertions over every run above.
  const ungated = runs.flatMap((r) => r.res.actions.filter((a: any) => ["operational", "financial"].includes(a.risk) && a.status !== "awaiting_approval"));
  record(seed, "O4", "No operational or financial action runs without approval", !ungated.length, `${runs.reduce((s, r) => s + r.res.actions.length, 0)} actions proposed, ${ungated.length} ungated`);
  const unexplained = runs.flatMap((r) => r.res.decisions.filter((d: any) => d.rm_per_month !== undefined)
    .filter(() => !r.events.some((e) => e.action.startsWith("calc.")) || !r.events.some((e) => e.agent_name === "Skeptic" && e.action === "approve")).map((d: any) => `${r.res.run_id}: ${d.verdict}`));
  record(seed, "O6", "Every RM figure has calculator events and a Skeptic approval", !unexplained.length, unexplained.join("; ") || `${runs.length} runs`);
  const badLog = runs.flatMap((r) => r.events.filter((e) => REQUIRED.some((f) => !(f in e))).map((e) => `${r.res.run_id} ${e.action}`));
  const overCap = runs.filter((r) => r.rec.tool_calls > 30).map((r) => `${r.res.run_id} (${r.rec.tool_calls})`);
  record(seed, "LOG", "Log fields present; runs within caps", !badLog.length && !overCap.length,
    `${runs.reduce((s, r) => s + r.events.length, 0)} events; max ${Math.max(...runs.map((r) => r.rec.tool_calls))} tool calls${overCap.length ? `; over cap ${overCap.join(", ")}` : ""}${badLog.length ? `; missing fields ${badLog.slice(0, 3).join(", ")}` : ""}`);
}

// Anti-overfitting: no outlet ID, machine name or planted number in agent code, prompts or templates; nothing reads outputs.
function grepChecks() {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".ts") && !d.name.endsWith(".test.ts") ? [join(dir, d.name)] : []);
  const code = ["apps/backend/src/agents", "apps/backend/src/templates", "apps/backend/src/calc", "apps/backend/src/engines"].flatMap(files);
  const ids = /OUT-0\d|\b[DGW][1-8]\b|2\.15\b|0\.33\b|\bRM18[02]\b|2026-10-06/;
  const hits = code.flatMap((f) => readFileSync(f, "utf8").split("\n").map((l, i) => [f, i + 1, l] as const)).filter(([, , l]) => ids.test(l) && !/^\s*\/\//.test(l));
  record("-", "8.5", "No planted IDs or numbers in agents, templates, calculators, engines", !hits.length, hits.map(([f, n, l]) => `${f}:${n} ${l.trim().slice(0, 60)}`).join("; ") || `${code.length} files clean`);
  const readers = files("apps/backend/src").filter((f) => /output_examples/.test(readFileSync(f, "utf8")));
  record("-", "8.5", "Nothing in the app reads output_examples/", !readers.length, readers.join(", ") || "no reader");
}

grepChecks();
await seedChecks(1, "data/sample");
await seedChecks(2, "data/seed2");

const lines = ["# SmartFlux evaluation", "", `Generated by \`pnpm eval\` on ${new Date().toISOString().slice(0, 10)}: sample mode, empty .env, fresh memory per check.`, "",
  "| Seed | Check | What | Result | Detail |", "| --- | --- | --- | --- | --- |",
  ...checks.map((c) => `| ${c.seed} | ${c.id} | ${c.name} | ${c.pass ? "✅ pass" : "❌ fail"} | ${c.detail.replaceAll("|", "/")} |`)];
writeFileSync("eval/report.md", lines.join("\n") + "\n");
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} seed ${c.seed} ${c.id} ${c.name}: ${c.detail.slice(0, 220)}`);
const failed = checks.filter((c) => !c.pass).length;
console.log(failed ? `\n${failed} check(s) failed — see eval/report.md` : `\nAll ${checks.length} checks passed — eval/report.md`);
process.exit(failed ? 1 : 0);
