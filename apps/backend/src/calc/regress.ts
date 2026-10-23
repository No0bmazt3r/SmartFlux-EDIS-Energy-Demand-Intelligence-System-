// Energy per machine without sensors (proposal §15.3): regress interval kWh on how much of each machine's
// cycles ran inside each interval. Non-negative: negative coefficients are dropped and the fit redone.
import { ols } from "./linalg.ts";

export type IntervalRow = { interval_start: string; kwh: number };
export type CycleRow = { machine_id: string; started_at: string; ended_at: string };
export type MachineFit = { machine_id: string; kwh_per_cycle: number; se: number; cycles: number; merged_with?: string[] };

const toMin = (ts: string) => Date.parse(ts.replace(" ", "T") + "Z") / 60000;
const NIGHT = (ts: string) => { const h = Number(ts.slice(11, 13)); return h >= 19 || h < 7 ? 1 : 0; }; // lights on

export function regressMachines(intervals: IntervalRow[], cycles: CycleRow[], machineIds: string[]) {
  const index = new Map(intervals.map((r, i) => [toMin(r.interval_start), i]));
  const x = machineIds.map(() => new Float64Array(intervals.length));
  const count = machineIds.map(() => 0);
  for (const c of cycles) {
    const m = machineIds.indexOf(c.machine_id);
    if (m < 0) continue;
    const s = toMin(c.started_at), e = toMin(c.ended_at), dur = e - s;
    if (dur <= 0) continue;
    let inside = 0;
    for (let t = Math.floor(s / 30) * 30; t < e; t += 30) {
      const i = index.get(t);
      if (i === undefined) continue; // missing interval: that share of the cycle is unobserved
      const overlap = (Math.min(e, t + 30) - Math.max(s, t)) / dur;
      x[m][i] += overlap;
      inside += overlap;
    }
    count[m] += inside;
  }

  // Merge machines that never run apart (collinear); report them as one.
  const groups: number[][] = [];
  const corr = (a: Float64Array, b: Float64Array) => {
    const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
  };
  for (let m = 0; m < machineIds.length; m++) {
    if (count[m] < 1) continue; // never used this period: nothing to estimate
    const g = groups.find((g) => corr(x[g[0]], x[m]) > 0.98);
    if (g) g.push(m); else groups.push([m]);
  }

  let active = groups.map((_, i) => i);
  const y = intervals.map((r) => Number(r.kwh));
  for (;;) {
    const X = intervals.map((r, t) => [1, NIGHT(r.interval_start), ...active.map((g) => groups[g].reduce((s, m) => s + x[m][t], 0))]);
    const fit = ols(X, y);
    if (!fit) throw new Error("Regression is singular");
    const coefs = fit.beta.slice(2);
    const worst = coefs.reduce((w, v, i) => (v < coefs[w] ? i : w), 0);
    if (coefs.length && coefs[worst] < 0) { active = active.filter((_, i) => i !== worst); continue; }
    const machines: MachineFit[] = [];
    for (const [gi, g] of groups.entries()) {
      const k = active.indexOf(gi);
      for (const m of g) machines.push({
        machine_id: machineIds[m], kwh_per_cycle: k < 0 ? 0 : coefs[k], se: k < 0 ? 0 : fit.se[k + 2], cycles: count[m],
        ...(g.length > 1 ? { merged_with: g.filter((o) => o !== m).map((o) => machineIds[o]) } : {}),
      });
    }
    return { base_kwh_per_interval: fit.beta[0], night_extra_kwh_per_interval: fit.beta[1], r2: fit.r2, intervals: intervals.length, machines };
  }
}

export type RegressResult = ReturnType<typeof regressMachines>;
