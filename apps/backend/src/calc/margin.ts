// Energy cost vs the price the customer pays, per cycle (proposal §15.5).
import { median } from "./fault.ts";

export function marginCalc(kwhPerCycle: number, rateRmPerKwh: number, prices: number[], extraCostPerCycle = 0) {
  const energy = kwhPerCycle * rateRmPerKwh + extraCostPerCycle; // extra: e.g. LPG for gas dryers
  const price = median(prices);
  return { energy_cost_per_cycle: energy, median_price: price, margin_per_cycle: price - energy, energy_share_of_price: price ? energy / price : 0 };
}
