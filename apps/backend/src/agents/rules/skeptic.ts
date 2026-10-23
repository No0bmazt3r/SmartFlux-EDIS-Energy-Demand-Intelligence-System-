// Rules twin of the Skeptic: re-derives every claim with its own queries before the Reporter may use it.
// It can send a claim back to the Investigator, and it is the only path to "approved".
import { ratesFromRows, touCalc, weeksFromRows, type TouResult } from "../../calc/tou.ts";
import { asOfEnd } from "../../templates/index.ts";
import { rejectionCapHit } from "../../orchestrator/caps.ts";
import { calc, query, type Ctx } from "../../orchestrator/tools.ts";
import { WINDOW, type Claim, type RunState } from "../../orchestrator/state.ts";

const close = (a: number, b: number) => Math.abs(a - b) <= 0.005 * Math.max(1, Math.abs(a), Math.abs(b));

function verifyTariff(state: RunState, ctx: Ctx, claim: Claim): string | undefined {
  const claimed = claim.data as TouResult;
  const split = query(state, ctx, "Skeptic", "tou_split", { outlet: state.outlet_id, from: `${WINDOW.start} 00:00:00`, to: asOfEnd(state.as_of) });
  const tariffs = query(state, ctx, "Skeptic", "tariff_rates", { outlet: state.outlet_id });
  const { out: re } = calc(state, ctx, "Skeptic", "tou_calc", "verification recompute",
    () => touCalc(weeksFromRows(split.rows as any), ratesFromRows(tariffs.rows as any)),
    (r) => `verdict ${r.verdict}, ToU-flat RM${(-r.saving_per_month).toFixed(2)}/month`);
  if (!close(re.saving_per_month, claimed.saving_per_month) || !close(re.peak_share, claimed.peak_share))
    return `numbers do not reproduce from the data (claimed RM${claimed.saving_per_month.toFixed(2)}, re-derived RM${re.saving_per_month.toFixed(2)})`;
  if (claimed.verdict === "switch" && re.weeks.some((w) => w.peak_share >= re.breakeven))
    return `verdict "switch" but week ${re.worst_week.week} is above break-even`;
  if (re.verdict !== claimed.verdict) return `verdict should be "${re.verdict}", not "${claimed.verdict}"`;
  return undefined;
}

const VERIFIERS: Record<string, (s: RunState, c: Ctx, claim: Claim) => string | undefined> = { tariff: verifyTariff };

export function skeptic(state: RunState, ctx: Ctx): "approved" | "revise" {
  let revise = false;
  for (const claim of state.claims.filter((c) => c.status === "proposed")) {
    const problem = VERIFIERS[claim.type](state, ctx, claim);
    const h = state.hypotheses.find((x) => x.id === claim.hypothesis_id)!;
    if (!problem) {
      claim.status = "approved";
      h.status = "supported";
      ctx.emit({ agent_name: "Skeptic", action: "approve", input_summary: `claim ${claim.id}: ${claim.text}`, output_summary: "re-derived from the data; approved", target_agent: "Reporter", confidence: 0.9 });
      continue;
    }
    claim.status = "rejected";
    claim.reason = problem;
    state.counters.rejections[h.id] = (state.counters.rejections[h.id] ?? 0) + 1;
    if (rejectionCapHit(state, h.id)) {
      h.status = "unresolved";
      state.unresolved.push(`${h.text}: ${problem}`);
    } else revise = true;
    ctx.emit({ agent_name: "Skeptic", action: "verify", input_summary: `claim ${claim.id}: ${claim.text}`, output_summary: `Rejected: ${problem}`, target_agent: "Investigator", status: "needs_revision", retry_count: state.counters.rejections[h.id] });
  }
  return revise ? "revise" : "approved";
}
