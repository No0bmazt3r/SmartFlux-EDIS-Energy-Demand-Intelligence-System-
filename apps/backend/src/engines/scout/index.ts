// Intent routing and risk gating, modelled on Meterless Scout Intent (the engine spec was not available,
// so this is plain code, described as such). Same table in sample and live mode.
import type { Intent, Lang, Risk } from "../../orchestrator/state.ts";

const INTENT_PATTERNS: [Intent, RegExp][] = [
  ["energy_plan", /\bsolar\b|\bsuria\b|panel/i],
  ["tariff_decision", /\btou\b|time[- ]of[- ]use|tariff|tarif|\bswitch\b|\btukar\b/i],
  ["advice_followup", /did .*(work|help)|\bverif|berjaya|berkesan|\bservic(e|ing) .*(work|save)/i],
  ["bill_investigation", /\bbill\b|\bbil\b|higher|expensive|\bmahal\b|\bnaik\b|why .*cost/i],
  ["machine_health", /machine|\bmesin\b|dryer|pengering|washer|basuh|wast|\brugi\b|fault|rosak|faulty/i],
  ["load_shift_plan", /\bshift\b|promo|off-peak|luar puncak|\balih\b|schedule/i],
  ["esg_summary", /carbon|\bco2\b|emission|scope ?2|\besg\b|pelepasan/i],
];

const MALAY = /\b(saya|patut|tukar|mesin|yang|mana|kenapa|bil|ke|adakah|berapa|ini|itu|dan|tak|tidak)\b/i;

// Risk of each action the agent can propose. Operational and financial actions always wait for the owner.
export const ACTION_RISK: Record<string, Risk> = {
  explain: "read_only",
  advise: "advisory",
  schedule_service: "operational",
  run_promo: "operational",
  hold_dryer_start: "operational",
  request_solar_quote: "financial",
  switch_tariff: "financial",
};

export const CAPABILITIES = [
  "Solar, ToU or both: the joint energy decision",
  "Should I switch to the ToU tariff?",
  "Why was my bill higher?",
  "Which machine is wasting money? (electric and gas dryers)",
  "Did an approved fix actually save money?",
  "When should heavy loads run (load shifting, promos)?",
  "Scope 2 emissions figures",
];

export function classify(text: string, lang?: Lang) {
  const intents = INTENT_PATTERNS.filter(([, re]) => re.test(text)).map(([i]) => i);
  return {
    intents: intents.length ? intents : (["out_of_scope"] as Intent[]),
    risk: "read_only" as Risk, // a question is read-only; actions are gated separately by gate()
    lang: lang ?? (MALAY.test(text) ? "ms" : "en") as Lang,
  };
}

export function gate(actionType: string): "auto" | "await_approval" {
  const risk = ACTION_RISK[actionType];
  if (!risk) throw new Error(`Unknown action type ${actionType}`);
  return risk === "read_only" || risk === "advisory" ? "auto" : "await_approval";
}
