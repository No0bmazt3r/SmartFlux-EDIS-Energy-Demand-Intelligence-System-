import assert from "node:assert/strict";
import { test } from "node:test";
import { faultCheck } from "./fault.ts";
import { regressMachines } from "./regress.ts";

const ts = (min: number) => new Date(Date.UTC(2026, 8, 7) + min * 60000).toISOString().replace("T", " ").slice(0, 19);

test("recovers each machine's kWh per cycle from interval totals (no noise)", () => {
  const truth: Record<string, number> = { A: 2.1, B: 0.35, C: 0.8 };
  const cycles: { machine_id: string; started_at: string; ended_at: string }[] = [];
  const kwh = new Array(336).fill(0.45); // base load per half hour
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [id, e] of Object.entries(truth))
    for (let start = 30 * Math.floor(rand() * 20); start < 336 * 30 - 120; start += 60 + Math.floor(rand() * 300)) {
      const dur = 40 + Math.floor(rand() * 20);
      cycles.push({ machine_id: id, started_at: ts(start), ended_at: ts(start + dur) });
      for (let m = start; m < start + dur; m++) kwh[Math.floor(m / 30)] += e / dur;
    }
  const intervals = kwh.map((k, i) => ({ interval_start: ts(i * 30), kwh: k }));
  const fit = regressMachines(intervals, cycles, Object.keys(truth));
  for (const m of fit.machines) assert.ok(Math.abs(m.kwh_per_cycle - truth[m.machine_id]) < 1e-6, `${m.machine_id} ${m.kwh_per_cycle}`);
  assert.ok(fit.r2 > 0.999);
});

const reading = (value: number, se = 0.05, cycles = 40) => ({ value, se, cycles });
const dryer = (id: string, base: number, cur: number, heat: "electric" | "gas" = "electric") =>
  ({ machine_id: id, type: "dryer", heat_source: heat, baseline: reading(base), current: reading(cur) });
const opts = { days: 14, rateRmPerKwh: 0.5068, lpgRmPerMinute: 0.05 };

test("flags a +33% dryer whose peers barely moved, and costs it", () => {
  const res = faultCheck([dryer("D4", 2.1, 2.8), dryer("D1", 2.0, 2.06), dryer("D2", 2.2, 2.27)], opts);
  const d4 = res.find((r) => r.machine_id === "D4")!;
  assert.equal(d4.flagged, true);
  assert.ok(Math.abs(d4.waste_rm_per_month - 0.7 * (40 / 14) * (365.25 / 12) * 0.5068) < 1e-9);
  assert.ok(res.filter((r) => r.machine_id !== "D4").every((r) => !r.flagged));
});

test("does not flag a humid week where every dryer rose together", () => {
  const res = faultCheck([dryer("D1", 2.0, 2.5), dryer("D2", 2.0, 2.48), dryer("D3", 2.1, 2.6)], opts);
  assert.ok(res.every((r) => !r.flagged));
});

test("gas dryers are judged on minutes, with the 10% threshold", () => {
  const res = faultCheck([dryer("G3", 52, 62.4, "gas"), dryer("G1", 52, 52.5, "gas"), dryer("G2", 51, 51.2, "gas")], opts);
  const g3 = res.find((r) => r.machine_id === "G3")!;
  assert.equal(g3.flagged, true);
  assert.equal(g3.metric, "minutes_per_cycle");
});
