// Rules twin of the Planner: a fixed hypothesis set per intent. Intents without a recipe yet are
// reported as unresolved rather than answered.
import type { Ctx } from "../../orchestrator/tools.ts";
import type { Hypothesis, Intent, RunState } from "../../orchestrator/state.ts";

const RECIPES: Partial<Record<Intent, string[]>> = {
  tariff_decision: ["The ToU tariff is cheaper than the flat tariff for this outlet's load"],
};

export function planner(state: RunState, ctx: Ctx) {
  const fresh: Hypothesis[] = [];
  for (const intent of state.intents) {
    const texts = RECIPES[intent];
    if (!texts) {
      state.unresolved.push(`${intent}: not built yet in the rules reasoner`);
      continue;
    }
    for (const text of texts) {
      if (state.hypotheses.some((h) => h.intent === intent && h.text === text)) continue;
      fresh.push({ id: `h${state.hypotheses.length + fresh.length + 1}`, intent, text, status: "open" });
    }
  }
  state.hypotheses.push(...fresh);
  ctx.emit({
    agent_name: "Planner", action: "plan",
    input_summary: `intents=[${state.intents.join(",")}] as_of=${state.as_of}`,
    output_summary: `${fresh.length} hypotheses: ${fresh.map((h) => h.text).join("; ") || "none"}`,
    target_agent: "Investigator",
  });
}
