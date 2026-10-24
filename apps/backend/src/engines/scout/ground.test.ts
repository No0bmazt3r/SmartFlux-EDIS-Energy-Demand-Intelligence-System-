import assert from "node:assert/strict";
import { test } from "node:test";
import { groundIntents } from "./index.ts";

test("an LLM's extra intents are dropped when the question never mentions them (seen live on 24 Oct)", () => {
  const g = groundIntents("Why was my bill higher this month? Should I switch to ToU?",
    ["bill_investigation", "energy_plan", "tariff_decision", "load_shift_plan"]);
  assert.deepEqual(g.intents, ["bill_investigation", "tariff_decision"]);
  assert.deepEqual(g.dropped, ["energy_plan", "load_shift_plan"]);
});

test("explicit topics are kept, and an ask the LLM missed is added back", () => {
  assert.deepEqual(groundIntents("Solar, ToU or both?", ["energy_plan"]).intents, ["energy_plan", "tariff_decision"]);
  assert.deepEqual(groundIntents("Why was my bill higher? Should I switch to ToU?", ["bill_investigation"]).intents,
    ["bill_investigation", "tariff_decision"]);
  assert.deepEqual(groundIntents("Did the promo help?", ["advice_followup"]).dropped, []);
});

test("a paraphrase the rules table misses can still come from the LLM", () => {
  // No rules keyword for this phrasing; the LLM's reading is kept because tariff questions may be paraphrased.
  const g = groundIntents("Is the peak-hour pricing plan worth it for me?", ["tariff_decision"]);
  assert.deepEqual(g.intents, ["tariff_decision"]);
});

test("out_of_scope stays only when nothing else applies", () => {
  assert.deepEqual(groundIntents("Write me a marketing email", ["out_of_scope"]).intents, ["out_of_scope"]);
  assert.deepEqual(groundIntents("Write me a marketing email", ["load_shift_plan"]).intents, ["out_of_scope"]);
});
