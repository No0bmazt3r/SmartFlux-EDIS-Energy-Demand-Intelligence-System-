// Rules twin of the Investigator: runs the templates and calculators for each open hypothesis and
// turns calculator output into claims. It never states a number it did not compute.
import { ratesFromRows, touCalc, weeksFromRows } from "../../calc/tou.ts";
import { asOfEnd } from "../../templates/index.ts";
import { capsHit } from "../../orchestrator/caps.ts";
import { calc, query, type Ctx } from "../../orchestrator/tools.ts";
import { WINDOW, type Hypothesis, type RunState } from "../../orchestrator/state.ts";

const pct = (x: number) => (x * 100).toFixed(1);

function investigateTariff(state: RunState, ctx: Ctx, h: Hypothesis) {
  const split = query(state, ctx, "Investigator", "tou_split", { outlet: state.outlet_id, from: `${WINDOW.start} 00:00:00`, to: asOfEnd(state.as_of) });
  const tariffs = query(state, ctx, "Investigator", "tariff_rates", { outlet: state.outlet_id });
  const tou = calc(state, ctx, "Investigator", "tou_calc", `${split.rows.length} week/period rows, ${tariffs.rows.length} tariff rows`,
    () => touCalc(weeksFromRows(split.rows as any), ratesFromRows(tariffs.rows as any)),
    (r) => `peak ${pct(r.peak_share)}% vs breakeven ${pct(r.breakeven)}%, worst week ${r.worst_week.week} ${pct(r.worst_week.peak_share)}%, verdict ${r.verdict}, ToU-flat RM${(-r.saving_per_month).toFixed(2)}/month`,
    "Skeptic");
  state.claims.push({
    id: `c${state.claims.length + 1}`, hypothesis_id: h.id, type: "tariff",
    text: `Tariff verdict: ${tou.out.verdict}`, data: tou.out, evidence: [split.id, tariffs.id, tou.id], status: "proposed",
  });
}

const RECIPES: Record<string, (s: RunState, c: Ctx, h: Hypothesis) => void> = { tariff_decision: investigateTariff };

export function investigator(state: RunState, ctx: Ctx) {
  for (const h of state.hypotheses.filter((h) => h.status === "open")) {
    const pending = state.claims.some((c) => c.hypothesis_id === h.id && c.status !== "rejected");
    if (pending) continue;
    if (capsHit(state)) return;
    RECIPES[h.intent](state, ctx, h);
  }
}
