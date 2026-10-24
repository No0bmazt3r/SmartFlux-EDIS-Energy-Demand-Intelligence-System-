// Nemotron-backed agent steps (live mode), all through the one Nightshift generator. Each step's output is
// checked before it is used; anything invalid throws, and the caller falls back to the rules twin.
// The LLM never computes money: it classifies, chooses, judges and words. Calculators do every number.
import { parseJson, type Generator } from "../../adapters/llm.ts";
import type { Decision, HypothesisKind, Intent, Lang } from "../../orchestrator/state.ts";

const INTENTS: Record<Exclude<Intent, "out_of_scope">, string> = {
  energy_plan: "solar, the ToU tariff, or both (the joint energy decision)",
  tariff_decision: "whether to switch to the Time-of-Use tariff",
  bill_investigation: "why the electricity bill or usage changed",
  machine_health: "which washer or dryer is wasting energy or money",
  advice_followup: "whether an approved fix or earlier advice worked",
  load_shift_plan: "moving heavy loads or promos to off-peak hours",
  esg_summary: "carbon, emissions, Scope 1 or Scope 2 figures",
};

export async function llmScout(llm: Generator, question: string) {
  const g = await llm(
    `Request from a laundromat owner: """${question}"""\n\nIntents:\n${Object.entries(INTENTS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n` +
    `- out_of_scope: anything else\n\nReturn JSON {"intents": [...], "lang": "en" | "ms"}. Use only the intents the owner actually asks about; ` +
    `do not add related topics they did not mention (no energy_plan unless solar is mentioned, no load_shift_plan unless shifting or promos are). ` +
    `lang is the language of the request (ms = Bahasa Melayu).`,
    { lane: "fast", json: true, maxTokens: 120, system: "You are Scout, the intent router of an energy agent for Malaysian laundromats. Answer with JSON only." },
  );
  const out = parseJson<{ intents: string[]; lang: string }>(g.text);
  const valid = [...Object.keys(INTENTS), "out_of_scope"];
  const intents = (out.intents ?? []).filter((i) => valid.includes(i)) as Intent[];
  if (!intents.length) throw new Error(`Scout returned no valid intent: ${g.text.slice(0, 100)}`);
  return { intents: intents.includes("out_of_scope") && intents.length > 1 ? intents.filter((i) => i !== "out_of_scope") : intents, lang: (out.lang === "ms" ? "ms" : "en") as Lang, model: g.model, ms: g.ms };
}

const OPTIONAL: Partial<Record<HypothesisKind, string>> = {
  humidity: "humid weather raised dryer energy (test against peers)",
  traffic: "more or fewer customers changed usage",
  holiday: "a public holiday changed the pattern",
  fault: "a dryer is using more energy or time per cycle than normal",
};

// Chooses which optional hypotheses are worth testing for this request, using what H-MEM recalled.
export async function llmPlanner(llm: Generator, i: { question: string; intents: Intent[]; required: HypothesisKind[]; memory: string[] }) {
  const g = await llm(
    `Owner's question: """${i.question || "(weekly briefing)"}"""\nIntents: ${i.intents.join(", ")}\nAlready planned: ${i.required.join(", ")}\n` +
    `What we remember about this outlet:\n${i.memory.map((m) => `- ${m}`).join("\n") || "- nothing yet"}\n\nOptional hypotheses you may add:\n` +
    `${Object.entries(OPTIONAL).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\nReturn JSON {"add": [kinds], "reasons": {"kind": "one short sentence"}}. Add only what could explain the answer; add none for a plain tariff or solar question.`,
    { lane: "fast", json: true, maxTokens: 250, system: "You are Planner. You choose hypotheses to test; you never state numbers. Answer with JSON only." },
  );
  const out = parseJson<{ add: string[]; reasons?: Record<string, string> }>(g.text);
  const add = (out.add ?? []).filter((k) => k in OPTIONAL && !i.required.includes(k as HypothesisKind)) as HypothesisKind[];
  return { add, reasons: out.reasons ?? {}, model: g.model, ms: g.ms };
}

// Causal judgment on a claim the deterministic checks already passed. It may rule out a causal claim, never
// approve one that failed: the caller only asks about claims whose numbers reproduced.
export async function llmSkeptic(llm: Generator, i: { kind: HypothesisKind; claim: string; facts: Record<string, unknown>; finding: string }) {
  const g = await llm(
    `Claim (${i.kind}): ${i.claim}\nFacts re-derived from the data: ${JSON.stringify(i.facts)}\nDeterministic check: ${i.finding}\n\n` +
    `Is the causal story right? Check peers, timing and alternative causes. Return JSON {"verdict": "approve" | "rule_out", "reason": "one sentence for the owner"}.`,
    { lane: "deep", json: true, maxTokens: 200, system: "You are Skeptic, the reviewer of an energy agent. You challenge correlation versus cause. Use only the facts given. Answer with JSON only." },
  );
  const out = parseJson<{ verdict: string; reason: string }>(g.text);
  if (out.verdict !== "approve" && out.verdict !== "rule_out") throw new Error(`Skeptic returned an invalid verdict: ${g.text.slice(0, 100)}`);
  return { verdict: out.verdict as "approve" | "rule_out", reason: String(out.reason ?? "").slice(0, 300), model: g.model, ms: g.ms };
}

const numbers = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ""));

// Plain-language wording of the cards in the owner's language. Every number in the rewrite must already be
// in the card (numbers are never invented or converted by the model); otherwise the template text stays.
export async function llmReporter(llm: Generator, decisions: Decision[], lang: Lang) {
  if (!decisions.length) return { decisions, model: undefined as string | undefined, ms: 0, rejected: 0 };
  const g = await llm(
    `Rewrite these decision cards for a busy laundromat owner in ${lang === "ms" ? "Bahasa Melayu" : "English"}: short, plain, no jargon.\n` +
    `Keep every number exactly as written, add no new numbers, keep the same number of evidence lines.\n${JSON.stringify(decisions.map((d) => ({ verdict: d.verdict, evidence: d.evidence })))}\n\n` +
    `Return JSON {"cards": [{"verdict": "...", "evidence": ["..."]}]} in the same order.`,
    { lane: "deep", json: true, maxTokens: 1500, system: "You are Reporter. You only reword; numbers come from calculators and must not change. Answer with JSON only." },
  );
  const out = parseJson<{ cards: { verdict: string; evidence: string[] }[] }>(g.text);
  let rejected = 0;
  const reworded = decisions.map((d, i) => {
    const c = out.cards?.[i];
    const allowed = new Set(numbers([d.verdict, ...d.evidence].join(" ")));
    const ok = c && typeof c.verdict === "string" && Array.isArray(c.evidence) && c.evidence.length === d.evidence.length &&
      numbers([c.verdict, ...c.evidence].join(" ")).every((n) => allowed.has(n));
    if (!ok) { rejected++; return d; }
    return { ...d, verdict: c.verdict, evidence: c.evidence };
  });
  return { decisions: reworded, model: g.model, ms: g.ms, rejected };
}
