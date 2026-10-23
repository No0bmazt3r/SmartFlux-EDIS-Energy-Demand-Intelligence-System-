// Fault check (proposal §15.4). Electric dryers: kWh per cycle. Gas dryers: the meter can't see the burner,
// so minutes per cycle. A machine is flagged only if it moved past the threshold, beyond 2 standard errors,
// and its peers of the same type moved less than half as much (rules out weather and voltage).

export type Reading = { value: number; se: number; cycles: number };
export type MachineReadings = { machine_id: string; type: string; heat_source: "electric" | "gas"; baseline: Reading; current: Reading };

export const THRESHOLD = { electric: 0.2, gas: 0.1 };

export const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Median minutes per cycle with its standard error (1.2533 · sd / √n for a median).
export function durationReading(cycles: { started_at: string; ended_at: string }[]): Reading {
  const mins = cycles.map((c) => (Date.parse(c.ended_at.replace(" ", "T") + "Z") - Date.parse(c.started_at.replace(" ", "T") + "Z")) / 60000);
  const mean = mins.reduce((s, v) => s + v, 0) / (mins.length || 1);
  const sd = Math.sqrt(mins.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, mins.length - 1));
  return { value: median(mins), se: (1.2533 * sd) / Math.sqrt(Math.max(1, mins.length)), cycles: mins.length };
}

export function faultCheck(machines: MachineReadings[], opts: { days: number; rateRmPerKwh: number; lpgRmPerMinute: number }) {
  const delta = (m: MachineReadings) => m.current.value / m.baseline.value - 1;
  return machines.map((m) => {
    const peers = machines.filter((p) => p !== m && p.type === m.type && p.heat_source === m.heat_source);
    const peerDelta = peers.length ? peers.reduce((s, p) => s + delta(p), 0) / peers.length : 0;
    const d = delta(m);
    const gap = m.current.value - m.baseline.value;
    const se = Math.sqrt(m.current.se ** 2 + m.baseline.se ** 2);
    const threshold = THRESHOLD[m.heat_source];
    const checks = { above_threshold: d >= threshold, beyond_2se: gap > 2 * se, peers_moved_less: peerDelta < d / 2 };
    const flagged = m.type === "dryer" && checks.above_threshold && checks.beyond_2se && checks.peers_moved_less;
    const cyclesPerMonth = (m.current.cycles / opts.days) * (365.25 / 12);
    const wasteRm = flagged ? gap * cyclesPerMonth * (m.heat_source === "gas" ? opts.lpgRmPerMinute : opts.rateRmPerKwh) : 0;
    return {
      machine_id: m.machine_id, heat_source: m.heat_source, metric: m.heat_source === "gas" ? "minutes_per_cycle" : "kwh_per_cycle",
      baseline: m.baseline.value, current: m.current.value, delta_pct: d * 100, peer_delta_pct: peerDelta * 100, gap_se: se ? gap / se : 0,
      checks, flagged, cycles_per_month: cyclesPerMonth, waste_rm_per_month: wasteRm,
    };
  });
}

export type FaultResult = ReturnType<typeof faultCheck>[number];
