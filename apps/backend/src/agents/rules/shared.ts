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
  return { reading, cyclesStarted, evidence: [iv.id, cy.id, fit.id] };
}

export function meanReading(rs: (Reading | undefined)[]): Reading {
  const xs = rs.filter((r): r is Reading => !!r);
  return { value: xs.reduce((s, r) => s + r.value, 0) / xs.length, se: Math.sqrt(xs.reduce((s, r) => s + r.se ** 2, 0)) / xs.length, cycles: xs.reduce((s, r) => s + r.cycles, 0) };
}
