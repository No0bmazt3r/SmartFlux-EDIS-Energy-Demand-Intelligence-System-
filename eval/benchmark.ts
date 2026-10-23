// pnpm benchmark: 30 generated outlets (seeds 100–109 × 3 outlets), each run through the full agent loop in
// sample mode with a fresh memory, scored against what the generator planted (docs/data-and-evaluation.md §7).
// Writes eval/benchmark.md with every miss and its reason.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSampleDb } from "../apps/backend/src/adapters/local-sqlite.ts";
import { jointDecision } from "../apps/backend/src/calc/joint.ts";
import { solarCalc } from "../apps/backend/src/calc/solar.ts";
import { ratesFromRows, touCalc, weeksFromRows } from "../apps/backend/src/calc/tou.ts";
import { loadConfig } from "../apps/backend/src/config.ts";
import { run } from "../apps/backend/src/orchestrator/run.ts";
import type { RunRequest } from "../apps/backend/src/orchestrator/state.ts";
import { addDays, ts } from "../apps/backend/src/orchestrator/windows.ts";
import { querySqlite } from "../apps/backend/src/templates/index.ts";
import { generate } from "../scripts/generate-data.ts";

const SEEDS = Array.from({ length: 10 }, (_, i) => 100 + i);
const OUTLETS = ["OUT-01", "OUT-02", "OUT-03"];
const root = mkdtempSync(join(tmpdir(), "sf-bench-"));
const misses: string[] = [];
const t = { tou: [0, 0], joint: [0, 0], recall: [0, 0], belowThreshold: [0, 0], falseFlags: 0, mv: [0, 0], caps: [0, 0] };
const times: number[] = [];

for (const seed of SEEDS) {
  const dataDir = join(root, `seed${seed}`);
  await generate(seed, dataDir);
  const manifest = JSON.parse(readFileSync(join(dataDir, "manifest.json"), "utf8"));
  const db = openSampleDb(dataDir);
  const ask = async (req: RunRequest) => {
    const d = mkdtempSync(join(root, "run-"));
    const t0 = performance.now();
    const res = await run(req, { ...loadConfig({}), dataDir, logDir: join(d, "logs"), hmemDir: join(d, "hmem") }, { echo: false });
    times.push(performance.now() - t0);
    const rec = JSON.parse(readFileSync(join(d, "logs", `${res.run_id}.result.json`), "utf8"));
    t.caps[1]++; if (rec.tool_calls <= 30) t.caps[0]++; else misses.push(`seed ${seed} ${req.outlet_id}: ${rec.tool_calls} tool calls`);
    return rec;
  };

  for (const outlet of OUTLETS) {
    const tag = `seed ${seed} ${outlet}`;
    const rates = ratesFromRows(querySqlite(db, "tariff_rates", { outlet }, "2026-10-18") as any);
    // ToU verdict vs the calculator on the true data.
    const truthTou = touCalc(weeksFromRows(querySqlite(db, "tou_split", { outlet, from: ts("2026-09-07"), to: ts("2026-10-19") }, "2026-10-18") as any), rates);
    const tou = (await ask({ outlet_id: outlet, as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" })).findings.find((f: any) => f.kind === "tou")?.data.verdict;
    t.tou[1]++; if (tou === truthTou.verdict) t.tou[0]++; else misses.push(`${tag} ToU: agent ${tou}, calculator ${truthTou.verdict}`);

    // Joint solar/ToU decision vs the calculators run directly.
    const solar = solarCalc(querySqlite(db, "solar_inputs", { outlet, from: ts("2026-09-07"), to: ts("2026-10-19") }, "2026-10-18") as any,
      querySqlite(db, "solar_params", { outlet }, "2026-10-18")[0] as any, rates.flat);
    const rec = solar.options.find((o) => o.kwp === solar.recommended_kwp);
    const truthBest = rec ? jointDecision(truthTou, touCalc(rec.post_solar_weeks, rates), rec.kwp).best.option : truthTou.verdict === "stay" ? "flat" : "tou";
    const plan = (await ask({ outlet_id: outlet, as_of: "2026-10-18", question: "Solar, ToU or both?" })).findings.find((f: any) => f.kind === "energy")?.data;
    const got = plan?.joint?.best.option ?? (plan?.composition === "grid_only" ? (plan.grid.verdict === "stay" ? "flat" : "tou") : undefined);
    t.joint[1]++; if (got === truthBest) t.joint[0]++; else misses.push(`${tag} energy plan: agent ${got}, calculators ${truthBest}`);

    // Faults: ask when the fault has filled the 14-day window (the day before its service, or 18 Oct).
    const planted = manifest.plants.filter((p: any) => p.outlet_id === outlet && p.onset_week);
    const flagged = new Set<string>();
    for (const as_of of [...new Set(["2026-10-18", ...planted.map((p: any) => (p.serviced_on ? addDays(p.serviced_on, -1) : "2026-10-18"))])]) {
      const r = await ask({ outlet_id: outlet, as_of, question: "Which machine is wasting money?" });
      for (const f of r.findings.filter((x: any) => x.kind === "fault" && x.data.machine_id)) flagged.add(f.data.machine_id);
    }
    for (const p of planted) {
      const id = `${outlet}-${p.machine}`, size = p.heat_source === "gas" ? p.minutes_pct : p.kwh_pct;
      const bucket = size >= 0.2 ? t.recall : t.belowThreshold; // recall is counted on faults at or above +20% (decided 24 Oct)
      bucket[1]++;
      if (flagged.has(id)) bucket[0]++;
      else misses.push(`${tag} fault ${p.machine} (${p.heat_source}, +${(size * 100).toFixed(0)}%, onset week ${p.onset_week}) not flagged${bucket === t.belowThreshold ? " — below the +20% threshold, expected" : ""}`);
    }
    for (const id of flagged) if (!planted.some((p: any) => `${outlet}-${p.machine}` === id)) { t.falseFlags++; misses.push(`${tag} false flag ${id}`); }

    // M&V: realised per-cycle recovery within ±15% of what was planted, for serviced faults.
    for (const p of planted.filter((x: any) => x.serviced_on)) {
      const v = (await ask({ outlet_id: outlet, as_of: "2026-10-18", question: `Did servicing ${p.machine} work?` }))
        .findings.find((f: any) => f.kind === "verify" && f.data.machine_id === `${outlet}-${p.machine}`)?.data;
      const truth = p.heat_source === "gas" ? 52 * p.minutes_pct : 2.1 * p.kwh_pct;
      const realised = v?.mv?.realised_per_cycle;
      const err = realised === undefined ? Infinity : realised / truth - 1;
      t.mv[1]++;
      if (Math.abs(err) <= 0.15) t.mv[0]++;
      else misses.push(`${tag} M&V ${p.machine}: realised ${realised?.toFixed(2)} vs planted ${truth.toFixed(2)} ${p.heat_source === "gas" ? "min" : "kWh"}/cycle (${Number.isFinite(err) ? `${(err * 100).toFixed(0)}%` : "no result"})`);
    }
  }
}

const rate = ([a, b]: number[]) => (b ? `${a}/${b} (${((100 * a) / b).toFixed(0)}%)` : "n/a");
const median = times.sort((a, b) => a - b)[times.length >> 1];
const rows: [string, string, string, boolean][] = [
  ["ToU verdicts match the calculator", rate(t.tou), "100%", t.tou[0] === t.tou[1]],
  ["Joint solar/ToU decision matches the calculators", rate(t.joint), "100%", t.joint[0] === t.joint[1]],
  ["Fault recall (faults ≥ +20%)", rate(t.recall), "≥ 90%", !t.recall[1] || t.recall[0] / t.recall[1] >= 0.9],
  ["Faults +15–20% found (below threshold, reported only)", rate(t.belowThreshold), "stated limit", true],
  ["False fault flags across 30 outlets", String(t.falseFlags), "≤ 1", t.falseFlags <= 1],
  ["Realised saving within ±15% of planted (serviced faults)", rate(t.mv), "≥ 90%", !t.mv[1] || t.mv[0] / t.mv[1] >= 0.9],
  ["Runs within caps", rate(t.caps), "100%", t.caps[0] === t.caps[1]],
  ["Median run time, sample mode", `${median.toFixed(0)} ms`, "≤ 5 s", median <= 5000],
];
const md = ["# SmartFlux benchmark", "", `30 generated outlets (seeds ${SEEDS[0]}–${SEEDS.at(-1)}, 3 outlets each, real weather), ${times.length} agent runs in sample mode with fresh memory. Generated by \`pnpm benchmark\` on ${new Date().toISOString().slice(0, 10)}.`, "",
  "| Metric | Result | Target | Met |", "| --- | --- | --- | --- |", ...rows.map(([m, r, g, ok]) => `| ${m} | ${r} | ${g} | ${ok ? "✅" : "❌"} |`), "",
  "## Every miss", "", ...(misses.length ? misses.map((m) => `- ${m}`) : ["None."]), ""].join("\n");
writeFileSync("eval/benchmark.md", md);
console.log(md);
process.exit(rows.every((r) => r[3]) ? 0 : 1);
