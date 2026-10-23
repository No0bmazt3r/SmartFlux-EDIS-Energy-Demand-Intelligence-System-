// Load-shift plan (proposal §15.7) and the promo outcome check. Pure functions.
// shiftable kWh = dryer cycles started in weekday peak that an off-peak promo could move, capped by the
// idle dryer capacity in the promo slot; saving = shiftable kWh × (peak − off-peak rate).
import type { Rates } from "./tou.ts";

export const PROMO_RESPONSE = 0.15; // assumption, shown on the card: share of peak dryer cycles a promo moves
const DAYS_PER_MONTH = 365.25 / 12;
const isPeak = (dow: number, hour: number, holiday: boolean) => !holiday && dow >= 1 && dow <= 5 && hour >= 14 && hour < 22;

export function shiftPlan(i: { dryerStarts: string[]; dryerMinutes: number[]; dryers: number; kwhPerCycle: number; rates: Rates; days: number; holidays: Set<string> }) {
  const peakStarts = i.dryerStarts.filter((s) => isPeak(new Date(s.replace(" ", "T") + "Z").getUTCDay(), Number(s.slice(11, 13)), i.holidays.has(s.slice(0, 10))));
  // Busy dryer-minutes per weekday × hour across the period, to find the off-peak slot with the most idle capacity.
  const busy = new Map<string, number>(), slots = new Map<string, number>();
  i.dryerStarts.forEach((s, k) => {
    const d = new Date(s.replace(" ", "T") + "Z"), key = `${d.getUTCDay()}-${d.getUTCHours()}`;
    busy.set(key, (busy.get(key) ?? 0) + i.dryerMinutes[k]);
  });
  const weeks = i.days / 7;
  // Promo slots are the late-evening hours right after peak (an idle 6 a.m. slot is no use to a promo). They are
  // ranked by idle capacity × the evening demand already there that day (18:00–22:00), because a promo works
  // best where customers already are.
  const evening = (dow: number) => [18, 19, 20, 21].reduce((s, h) => s + (busy.get(`${dow}-${h}`) ?? 0), 0);
  for (const dow of [0, 1, 2, 3, 4, 5, 6]) for (const hour of [22, 23])
    slots.set(`${dow}-${hour}`, 1 - (busy.get(`${dow}-${hour}`) ?? 0) / (i.dryers * 60 * weeks));
  const score = ([k, idle]: [string, number]) => idle * evening(Number(k.split("-")[0]));
  const [slot, idle] = [...slots.entries()].sort((a, b) => score(b) - score(a) || a[0].localeCompare(b[0]))[0];
  const [dow, hour] = slot.split("-").map(Number);
  const capacityCyclesPerWeek = idle * i.dryers * 60 / 52; // idle dryer-minutes in that hour per week ÷ a cycle
  const peakPerWeek = peakStarts.length / weeks;
  const shiftablePerWeek = Math.min(peakPerWeek * PROMO_RESPONSE, capacityCyclesPerWeek);
  const shiftableKwhMonth = shiftablePerWeek / 7 * DAYS_PER_MONTH * i.kwhPerCycle;
  return {
    slot: { day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow], hour, idle_share: idle },
    peak_dryer_cycles_per_week: peakPerWeek, shiftable_cycles_per_week: shiftablePerWeek,
    shiftable_kwh_per_month: shiftableKwhMonth, saving_rm_per_month: shiftableKwhMonth * (i.rates.peak - i.rates.offpeak), promo_response: PROMO_RESPONSE,
  };
}

// Did a promo move use off-peak? Off-peak share after vs before the start date, minus the same change at the
// other outlets (difference-in-differences, as for machine fixes).
export function promoCheck(i: { before: number; after: number; peersBefore: number; peersAfter: number; postDays: number }) {
  const change = (i.after - i.before) - (i.peersAfter - i.peersBefore);
  return {
    verdict: i.postDays < 10 ? "not_yet" : change >= 0.01 ? "verified" : "not_achieved",
    offpeak_share_change_pts: change * 100, outlet_change_pts: (i.after - i.before) * 100, peer_change_pts: (i.peersAfter - i.peersBefore) * 100,
  };
}
