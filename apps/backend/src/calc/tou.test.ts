import assert from "node:assert/strict";
import { test } from "node:test";
import { touCalc } from "./tou.ts";

const rates = { peak: 0.5217, offpeak: 0.4808, flat: 0.5068 };
const month = (365.25 / 12) * 48; // intervals in one average month
const sen = (x: number) => Math.round(x * 100) / 100;

test("reproduces proposal §24.1 to the sen", () => {
  const r = touCalc([{ week: 1, peak: 2192, offpeak: 1808, intervals: month }], rates);
  assert.equal(sen(r.breakeven * 100), 63.57);
  assert.equal(sen(r.cost_tou_per_month), 2012.85);
  assert.equal(sen(r.cost_flat_per_month), 2027.2);
  assert.equal(sen(r.saving_per_month), 14.35);
  assert.equal(r.verdict, "switch");
});

test("stays on flat above breakeven, cautions when one week crosses it", () => {
  const stay = touCalc([{ week: 1, peak: 700, offpeak: 300, intervals: 336 }], rates);
  assert.equal(stay.verdict, "stay");
  assert.ok(stay.saving_per_month < 0);

  const mixed = touCalc([
    { week: 1, peak: 500, offpeak: 500, intervals: 336 },
    { week: 2, peak: 680, offpeak: 320, intervals: 336 },
  ], rates);
  assert.equal(mixed.verdict, "switch_with_caution");
  assert.equal(mixed.worst_week.week, 2);
});
