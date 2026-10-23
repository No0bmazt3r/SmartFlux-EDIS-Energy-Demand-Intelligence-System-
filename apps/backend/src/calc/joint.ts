// The joint energy decision (proposal §15.6): compare all four options on the same post-action load.
// Summing "ToU saving" and "solar saving" from separate runs double-counts, because solar changes the load
// the tariff is applied to; this calculator states that interaction as a number.
import type { TouResult } from "./tou.ts";

export type Option = "flat" | "tou" | "solar_flat" | "solar_tou";

export function jointDecision(grid: TouResult, postSolar: TouResult | undefined, kwp: number | undefined) {
  const today = grid.cost_flat_per_month;
  const options: { option: Option; cost_rm_per_month: number; saving_rm_per_month: number }[] = [
    { option: "flat", cost_rm_per_month: grid.cost_flat_per_month, saving_rm_per_month: 0 },
    { option: "tou", cost_rm_per_month: grid.cost_tou_per_month, saving_rm_per_month: today - grid.cost_tou_per_month },
  ];
  if (postSolar) options.push(
    { option: "solar_flat", cost_rm_per_month: postSolar.cost_flat_per_month, saving_rm_per_month: today - postSolar.cost_flat_per_month },
    { option: "solar_tou", cost_rm_per_month: postSolar.cost_tou_per_month, saving_rm_per_month: today - postSolar.cost_tou_per_month },
  );
  const best = options.reduce((a, b) => (b.cost_rm_per_month < a.cost_rm_per_month ? b : a));
  const touGridOnly = options[1].saving_rm_per_month;
  const solarFlat = options.find((o) => o.option === "solar_flat")?.saving_rm_per_month ?? 0;
  const naiveSum = Math.max(0, touGridOnly) + solarFlat;
  return {
    best, options, kwp,
    tou_after_solar_rm_per_month: postSolar ? postSolar.cost_tou_per_month - postSolar.cost_flat_per_month : undefined, // >0: ToU costs more after solar
    peak_share: { grid: grid.peak_share, post_solar: postSolar?.peak_share }, breakeven: grid.breakeven,
    naive_sum_rm_per_month: naiveSum, overstatement_rm_per_month: naiveSum - best.saving_rm_per_month,
  };
}

export type JointResult = ReturnType<typeof jointDecision>;
