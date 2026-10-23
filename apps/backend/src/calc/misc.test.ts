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
