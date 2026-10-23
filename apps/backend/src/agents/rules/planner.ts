// Rules twin of the Planner: a fixed hypothesis set per intent. Intents without a recipe yet are
// reported as unresolved rather than answered.
import type { Ctx } from "../../orchestrator/tools.ts";
import type { Hypothesis, HypothesisKind, Intent, RunState } from "../../orchestrator/state.ts";

const HYPOTHESES: Record<HypothesisKind, string> = {
  tou: "The ToU tariff is cheaper than the flat tariff for this outlet's load",
  energy: "Solar, the ToU tariff, or both cut the bill the most",
  bill: "Energy use changed against the baseline week",
  fault: "A dryer is using more energy or time per cycle than its normal level",
  humidity: "Humid weather raised dryer energy",
  traffic: "More customers raised usage",
  holiday: "A public holiday changed the usage pattern",
  verify: "Approved advice delivered the predicted saving",
};

const RECIPES: Partial<Record<Intent, HypothesisKind[]>> = {
  energy_plan: ["energy"],
  tariff_decision: ["tou"],
  machine_health: ["fault"],
  advice_followup: ["verify"],
  bill_investigation: ["bill", "fault", "humidity", "traffic", "holiday"],
};

export function planner(state: RunState, ctx: Ctx) {
  const fresh: Hypothesis[] = [];
  for (const intent of state.intents) {
    const kinds = RECIPES[intent];
    if (!kinds) {
      state.unresolved.push(`${intent}: not built yet in the rules reasoner`);
      continue;
    }
    for (const kind of kinds) {
      if (kind === "tou" && state.intents.includes("energy_plan")) continue; // the joint decision already covers the tariff
      if ([...state.hypotheses, ...fresh].some((h) => h.kind === kind)) continue;
      fresh.push({ id: `h${state.hypotheses.length + fresh.length + 1}`, intent, kind, text: HYPOTHESES[kind], status: "open" });
    }
  }
  state.hypotheses.push(...fresh);
  ctx.emit({
    agent_name: "Planner", action: "plan",
    input_summary: `intents=[${state.intents.join(",")}] as_of=${state.as_of}`,
    output_summary: `${fresh.length} hypotheses: ${fresh.map((h) => h.kind).join(", ") || "none"}`,
    target_agent: "Investigator",
  });
}
