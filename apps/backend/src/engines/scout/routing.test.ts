import assert from "node:assert/strict";
import { test } from "node:test";
import { classify } from "./index.ts";

// 20 labelled owner requests, English and Malay: [text, expected intents (all must be found), language]
const CASES: [string, string[], "en" | "ms"][] = [
  ["Should I switch to the ToU tariff?", ["tariff_decision"], "en"],
  ["Solar, ToU or both?", ["energy_plan"], "en"],
  ["Is it worth putting solar panels on my roof?", ["energy_plan"], "en"],
  ["Why was my bill higher this month?", ["bill_investigation"], "en"],
  ["Why was my bill higher? Should I switch to ToU?", ["bill_investigation", "tariff_decision"], "en"],
  ["Which machine is wasting money?", ["machine_health"], "en"],
  ["Is dryer 4 faulty?", ["machine_health"], "en"],
  ["Did servicing D4 work?", ["advice_followup"], "en"],
  ["Did the promo help?", ["advice_followup"], "en"],
  ["When should I run a promo to shift load off-peak?", ["load_shift_plan"], "en"],
  ["What are my Scope 2 emissions?", ["esg_summary"], "en"],
  ["How much CO2 does my outlet produce?", ["esg_summary"], "en"],
  ["Write me a marketing email", ["out_of_scope"], "en"],
  ["Patut saya tukar ke ToU?", ["tariff_decision"], "ms"],
  ["Kenapa bil elektrik saya naik?", ["bill_investigation"], "ms"],
  ["Mesin mana yang rugi?", ["machine_health"], "ms"],
  ["Pengering mana yang rosak?", ["machine_health"], "ms"],
  ["Adakah servis pengering D4 berkesan?", ["advice_followup"], "ms"],
  ["Patut saya pasang solar atau tukar tarif?", ["energy_plan", "tariff_decision"], "ms"],
  ["Berapa pelepasan karbon kedai dobi saya?", ["esg_summary"], "ms"],
];

test("Scout routes 20 labelled English and Malay requests", () => {
  const misses = CASES.filter(([text, intents, lang]) => {
    const r = classify(text);
    return r.lang !== lang || !intents.every((i) => r.intents.includes(i as any)) || (intents.includes("out_of_scope") !== r.intents.includes("out_of_scope"));
  }).map(([text]) => `${text} → ${JSON.stringify(classify(text))}`);
  assert.deepEqual(misses, []);
});
