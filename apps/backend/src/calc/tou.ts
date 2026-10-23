// ToU switch decision (proposal §15.2). Pure function: no I/O, money rounded only for display.
export type Rates = { peak: number; offpeak: number; flat: number };
export type WeekKwh = { week: number; peak: number; offpeak: number; intervals: number };
export type TouVerdict = "switch" | "switch_with_caution" | "stay";

const DAYS_PER_MONTH = 365.25 / 12;

export function ratesFromRows(rows: { period: string; rate_rm_per_kwh: number }[]): Rates {
  const get = (p: string) => {
    const row = rows.find((r) => r.period === p);
    if (!row) throw new Error(`No ${p} rate in tariffs`);
    return Number(row.rate_rm_per_kwh);
  };
  return { peak: get("peak"), offpeak: get("offpeak"), flat: get("flat") };
}

export function weeksFromRows(rows: { week: number; period: string; kwh: number; intervals: number }[]): WeekKwh[] {
  const byWeek = new Map<number, WeekKwh>();
  for (const r of rows) {
    const w = byWeek.get(r.week) ?? { week: r.week, peak: 0, offpeak: 0, intervals: 0 };
    w[r.period === "peak" ? "peak" : "offpeak"] += Number(r.kwh);
    w.intervals += Number(r.intervals);
    byWeek.set(r.week, w);
  }
  return [...byWeek.values()].sort((a, b) => a.week - b.week);
}

export function touCalc(weeks: WeekKwh[], rates: Rates) {
  if (!weeks.length) throw new Error("tou_calc needs at least one week of data");
  if (rates.peak <= rates.offpeak) throw new Error("Peak rate must exceed off-peak rate");
  const breakeven = (rates.flat - rates.offpeak) / (rates.peak - rates.offpeak);
  const perWeek = weeks.map((w) => ({ week: w.week, peak_share: w.peak / (w.peak + w.offpeak) }));
  const peak = weeks.reduce((s, w) => s + w.peak, 0);
  const offpeak = weeks.reduce((s, w) => s + w.offpeak, 0);
  const days = weeks.reduce((s, w) => s + w.intervals, 0) / 48;
  const toMonth = DAYS_PER_MONTH / days;
  const kwhMonth = (peak + offpeak) * toMonth;
  const costTou = (peak * rates.peak + offpeak * rates.offpeak) * toMonth;
  const costFlat = (peak + offpeak) * rates.flat * toMonth;
  const peakShare = peak / (peak + offpeak);
  const worst = perWeek.reduce((a, b) => (b.peak_share > a.peak_share ? b : a));
  const verdict: TouVerdict =
    peakShare >= breakeven ? "stay" : perWeek.every((w) => w.peak_share < breakeven) ? "switch" : "switch_with_caution";
  return {
    verdict, breakeven, peak_share: peakShare, worst_week: worst, weeks: perWeek,
    kwh_per_month: kwhMonth, cost_tou_per_month: costTou, cost_flat_per_month: costFlat,
    saving_per_month: costFlat - costTou, // positive = ToU cheaper
    days, rates,
  };
}

export type TouResult = ReturnType<typeof touCalc>;
