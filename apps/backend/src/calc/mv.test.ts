import assert from "node:assert/strict";
import { test } from "node:test";
import { mvCheck } from "./mv.ts";

const r = (value: number, se = 0.05) => ({ value, se, cycles: 100 });

test("reproduces proposal §24.4: D4's service verified at about RM164, 90% of the prediction", () => {
  const res = mvCheck({ machine: { pre: r(2.8), post: r(2.15) }, peers: { pre: r(2.05, 0.02), post: r(2.03, 0.02) },
    predicted_rm_per_month: 182, cycles_per_month: 520, unit_cost_rm: 0.5, post_days: 12 });
  assert.ok(Math.abs(res.realised_per_cycle - 0.63) < 1e-9);
  assert.equal(Math.round(res.realised_rm_per_month * 10) / 10, 163.8);
  assert.equal(res.verdict, "verified");
  assert.equal(Math.round(res.share_of_prediction * 100), 90);
});

test("not yet with too few days after the action; not achieved when peers fell just as much", () => {
  const base = { predicted_rm_per_month: 182, cycles_per_month: 520, unit_cost_rm: 0.5 };
  assert.equal(mvCheck({ ...base, machine: { pre: r(2.8), post: r(2.15) }, peers: { pre: r(2.05), post: r(2.03) }, post_days: 5 }).verdict, "not_yet");
  const coincidence = mvCheck({ ...base, machine: { pre: r(2.8), post: r(2.6) }, peers: { pre: r(2.2), post: r(2.0) }, post_days: 14 });
  assert.equal(coincidence.verdict, "not_achieved");
  assert.ok(Math.abs(coincidence.realised_per_cycle) < 1e-9);
});
