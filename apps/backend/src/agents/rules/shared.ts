// Investigation steps the Investigator and the Skeptic both run, each through its own queries.
import { durationReading, type Reading } from "../../calc/fault.ts";
import { regressMachines } from "../../calc/regress.ts";
import { calc, query, type Ctx } from "../../orchestrator/tools.ts";
import type { RunState } from "../../orchestrator/state.ts";
import { fmt, addDays, ts, type Range } from "../../orchestrator/windows.ts";

// Regress one date range and return each machine's reading: kWh per cycle (electric) or median minutes (gas).
export async function fitWindow(state: RunState, ctx: Ctx, agent: string, r: Range, machines: { machine_id: string; heat_source: string }[], label: string) {
  const params = { outlet: state.outlet_id, from: ts(r.from), to: ts(r.to) };
  const iv = await query(state, ctx, agent, "interval_series", params);
  const cy = await query(state, ctx, agent, "cycle_overlap", params);
  const fit = calc(state, ctx, agent, "regress_machines", `${label} ${fmt(r.from)}–${fmt(addDays(r.to, -1))}`,
    () => regressMachines(iv.rows as any, cy.rows as any, machines.map((m) => m.machine_id)), (f) => `R² ${f.r2.toFixed(3)}`);
  const reading = (id: string): Reading | undefined => {
    const m = machines.find((x) => x.machine_id === id)!;
    if (m.heat_source === "gas") return durationReading(cy.rows.filter((c) => c.machine_id === id && c.started_at >= ts(r.from)) as any);
    const e = fit.out.machines.find((x) => x.machine_id === id);
    return e && { value: e.kwh_per_cycle, se: e.se, cycles: e.cycles };
  };
  const cyclesStarted = (id: string) => cy.rows.filter((c) => c.machine_id === id && c.started_at >= ts(r.from) && c.started_at < ts(r.to)).length;
  return { reading, cyclesStarted, cycles: cy.rows, evidence: [iv.id, cy.id, fit.id] };
}

// The peer control group's level: the median, so one peer with its own fault can't skew the comparison
// (a mean let a second faulty dryer inflate the measured saving in the benchmark). SE of a median ≈ 1.25 × SE of a mean.
export function peerReading(rs: (Reading | undefined)[]): Reading {
  const xs = rs.filter((r): r is Reading => !!r).sort((a, b) => a.value - b.value);
  const m = xs.length >> 1;
  const value = xs.length % 2 ? xs[m].value : (xs[m - 1].value + xs[m].value) / 2;
  return { value, se: (1.2533 * Math.sqrt(xs.reduce((s, r) => s + r.se ** 2, 0))) / xs.length, cycles: xs.reduce((s, r) => s + r.cycles, 0) };
}
