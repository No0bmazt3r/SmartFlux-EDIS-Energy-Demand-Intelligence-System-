// Solar sizing on the outlet's own half-hourly load and real radiation (proposal §15.6). Pure function.
// Exports are valued at zero (credit terms vary). Sizing rule: add 5 kWp blocks while each block's own
// payback stays inside the Solar ATAP offset term, so the recommendation never buys capacity that won't pay.
import type { WeekKwh } from "./tou.ts";

export type SolarRow = { interval_start: string; week: number; kwh: number; period: string; shortwave_radiation: number | null };
export type SolarParams = { roof_kwp_max: number; cost_rm_per_kwp: number; derate: number };

export const SIZES = [5, 10, 15, 20];
export const SCHEME_TERM_YEARS = 10;
const DAYS_PER_MONTH = 365.25 / 12;

function weeks(rows: SolarRow[], load: (r: SolarRow, i: number) => number): WeekKwh[] {
  const byWeek = new Map<number, WeekKwh>();
  rows.forEach((r, i) => {
    const w = byWeek.get(r.week) ?? { week: r.week, peak: 0, offpeak: 0, intervals: 0 };
    w[r.period === "peak" ? "peak" : "offpeak"] += load(r, i);
    w.intervals += 1;
    byWeek.set(r.week, w);
  });
  return [...byWeek.values()].sort((a, b) => a.week - b.week);
}

export function solarCalc(rows: SolarRow[], params: SolarParams, flatRate: number) {
  const toMonth = DAYS_PER_MONTH / (rows.length / 48);
  const gridWeeks = weeks(rows, (r) => Number(r.kwh));
  const options = SIZES.filter((s) => s <= params.roof_kwp_max).map((kwp) => {
    // GHI in W/m² over the hour; a half-hour interval yields kWp × GHI/1000 × derate × 0.5 kWh.
    const gen = rows.map((r) => (kwp * Number(r.shortwave_radiation ?? 0) / 1000) * params.derate * 0.5);
    const used = rows.map((r, i) => Math.min(gen[i], Number(r.kwh)));
    const genTotal = gen.reduce((s, v) => s + v, 0), usedTotal = used.reduce((s, v) => s + v, 0);
    const usedPeak = rows.reduce((s, r, i) => s + (r.period === "peak" ? used[i] : 0), 0);
    const savingFlat = usedTotal * flatRate * toMonth;
    return {
      kwp, cost_rm: kwp * params.cost_rm_per_kwp,
      generation_kwh_per_month: genTotal * toMonth, self_used_kwh_per_month: usedTotal * toMonth,
      self_used_in_peak_kwh_per_month: usedPeak * toMonth,
      self_use_share: genTotal ? usedTotal / genTotal : 0, export_share: genTotal ? 1 - usedTotal / genTotal : 0,
      saving_flat_rm_per_month: savingFlat, payback_years: savingFlat ? (kwp * params.cost_rm_per_kwp) / (12 * savingFlat) : Infinity,
      post_solar_weeks: weeks(rows, (r, i) => Number(r.kwh) - used[i]),
    };
  });

  let recommended: (typeof options)[number] | undefined;
  const marginal: { from: number; to: number; payback_years: number }[] = [];
  for (const o of options) {
    const prev = recommended;
    const extraCost = o.cost_rm - (prev?.cost_rm ?? 0), extraSaving = o.saving_flat_rm_per_month - (prev?.saving_flat_rm_per_month ?? 0);
    const payback = extraSaving > 0 ? extraCost / (12 * extraSaving) : Infinity;
    marginal.push({ from: prev?.kwp ?? 0, to: o.kwp, payback_years: payback });
    if (payback > SCHEME_TERM_YEARS) break;
    recommended = o;
  }
  return { possible: options.length > 0, params, options, marginal, recommended_kwp: recommended?.kwp, grid_weeks: gridWeeks };
}

export type SolarResult = ReturnType<typeof solarCalc>;
