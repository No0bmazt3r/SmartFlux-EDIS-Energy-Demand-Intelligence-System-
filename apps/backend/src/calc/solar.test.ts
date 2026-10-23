import assert from "node:assert/strict";
import { test } from "node:test";
import { jointDecision } from "./joint.ts";
import { solarCalc } from "./solar.ts";
import { touCalc } from "./tou.ts";

const rates = { peak: 0.5217, offpeak: 0.4808, flat: 0.5068 };
const month = (365.25 / 12) * 48;
const sen = (x: number) => Math.round(x * 100) / 100;

test("reproduces proposal §24.3: solar flips the ToU verdict and the naive RM521 is a double count", () => {
  const grid = touCalc([{ week: 1, peak: 2192, offpeak: 1808, intervals: month }], rates);
  const post = touCalc([{ week: 1, peak: 1942, offpeak: 1058, intervals: month }], rates);
  const j = jointDecision(grid, post, 10);
  assert.equal(j.best.option, "solar_flat");
  assert.equal(sen(j.best.saving_rm_per_month), 506.8);
  assert.equal(sen(j.options.find((o) => o.option === "solar_tou")!.saving_rm_per_month), 505.37);
  assert.equal(sen(j.tou_after_solar_rm_per_month!), 1.43);
  assert.equal(sen(j.naive_sum_rm_per_month), 521.15);
  assert.equal(sen(j.overstatement_rm_per_month), 14.35);
  assert.equal(sen(post.peak_share * 100), 64.73);
});

test("solar self-use is capped by the load, and sizing stops when the next block won't pay back", () => {
  // Two days: constant 1 kWh per half hour, 800 W/m² sunshine from 08:00 to 18:00.
  const rows = Array.from({ length: 96 }, (_, i) => {
    const h = Math.floor((i % 48) / 2);
    return { interval_start: `2026-09-0${7 + Math.floor(i / 48)} ${String(h).padStart(2, "0")}:${i % 2 ? "30" : "00"}:00`, week: 1, kwh: 1, period: h >= 14 && h < 22 ? "peak" : "offpeak", shortwave_radiation: h >= 8 && h < 18 ? 800 : 0 };
  });
  const r = solarCalc(rows, { roof_kwp_max: 15, cost_rm_per_kwp: 3500, derate: 0.8 }, 0.5068);
  assert.deepEqual(r.options.map((o) => o.kwp), [5, 10, 15]);
  // 5 kWp: 1.6 kWh per sunny half hour, of which 1 kWh is used (load cap) → 62.5% self-use.
  assert.ok(Math.abs(r.options[0].self_use_share - 0.625) < 1e-9);
  // Larger systems add no self-use (the load is already covered), so their marginal payback is infinite.
  assert.equal(r.recommended_kwp, 5);
  assert.equal(r.marginal[1].payback_years, Infinity);
});

test("no roof means no solar options", () => {
  const r = solarCalc([{ interval_start: "2026-09-07 12:00:00", week: 1, kwh: 1, period: "offpeak", shortwave_radiation: 900 }], { roof_kwp_max: 0, cost_rm_per_kwp: 3500, derate: 0.8 }, 0.5068);
  assert.equal(r.possible, false);
  assert.equal(r.recommended_kwp, undefined);
});
