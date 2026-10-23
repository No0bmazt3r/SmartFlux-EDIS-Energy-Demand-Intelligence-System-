import assert from "node:assert/strict";
import { test } from "node:test";
import { co2Calc } from "./co2.ts";
import { marginCalc } from "./margin.ts";

test("cost vs price per cycle: 2.15 kWh at RM0.5068 against RM6", () => {
  const m = marginCalc(2.15, 0.5068, [5, 6, 6, 7]);
  assert.equal(Math.round(m.energy_cost_per_cycle * 100) / 100, 1.09);
  assert.equal(m.median_price, 6);
  assert.equal(Math.round(m.margin_per_cycle * 100) / 100, 4.91);
});

test("scope 2 from grid kWh and the stored factor", () => {
  const c = co2Calc({ grid_kwh: 4000, grid_kg_per_kwh: 0.758, avoided_kwh: 1000 });
  assert.equal(c.scope2_tco2e, 3.032);
  assert.equal(c.scope1_tco2e, 0);
  assert.equal(c.avoided_tco2e, 0.758);
});

import { promoCheck, shiftPlan } from "./shift.ts";

test("shift plan: capped by the idle capacity of the promo hour, priced at the peak/off-peak gap", () => {
  // One week, 6 dryers: 40 cycles start on Tuesday 18:00 (peak); late evenings are empty.
  const starts = Array.from({ length: 40 }, () => "2026-09-08 18:00:00");
  const p = shiftPlan({ dryerStarts: starts, dryerMinutes: starts.map(() => 52), dryers: 6, kwhPerCycle: 2.1, rates: { peak: 0.5217, offpeak: 0.4808, flat: 0.5068 }, days: 7, holidays: new Set() });
  assert.deepEqual([p.slot.day, p.slot.hour], ["Tuesday", 22]);
  assert.equal(p.shiftable_cycles_per_week, Math.min(40 * 0.15, 6 * 60 / 52));
  assert.ok(Math.abs(p.saving_rm_per_month - (p.shiftable_cycles_per_week / 7) * (365.25 / 12) * 2.1 * 0.0409) < 1e-9);
});

test("promo check: difference-in-differences against the other outlets", () => {
  assert.equal(promoCheck({ before: 0.42, after: 0.45, peersBefore: 0.30, peersAfter: 0.305, postDays: 14 }).verdict, "verified");
  assert.equal(promoCheck({ before: 0.42, after: 0.45, peersBefore: 0.30, peersAfter: 0.33, postDays: 14 }).verdict, "not_achieved");
  assert.equal(promoCheck({ before: 0.42, after: 0.45, peersBefore: 0.30, peersAfter: 0.30, postDays: 5 }).verdict, "not_yet");
});
