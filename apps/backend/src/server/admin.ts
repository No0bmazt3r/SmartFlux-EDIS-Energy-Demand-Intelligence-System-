// GET /admin/overview: the franchise view across outlets (PRD FR-50 to FR-56). Numbers come from the same
// templates and calculators the agent uses; flags, advice and outcomes come from stored runs and H-MEM.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openSampleDb, type SampleDb } from "../adapters/local-sqlite.ts";
import { createZetaris } from "../adapters/zetaris.ts";
import { co2Calc } from "../calc/co2.ts";
import { durationReading } from "../calc/fault.ts";
import { regressMachines } from "../calc/regress.ts";
import { ratesFromRows, touCalc, weeksFromRows } from "../calc/tou.ts";
import type { Config } from "../config.ts";
import { openHmem } from "../engines/hmem/index.ts";
import { WINDOW } from "../orchestrator/state.ts";
import { addDays, ts } from "../orchestrator/windows.ts";
import { checkCap, prepare, querySqlite } from "../templates/index.ts";

export function readRuns(logDir: string, limit = 20) {
  if (!existsSync(logDir)) return [];
  return readdirSync(logDir).filter((f) => f.endsWith(".result.json"))
    .map((f) => JSON.parse(readFileSync(join(logDir, f), "utf8")))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

// Templates for the screens: Zetaris when configured, the local copy if it fails (same path as the agent's tools).
export function dataQuery(cfg: Config, asOf: string, db: SampleDb) {
  const z = cfg.zetaris && createZetaris(cfg.zetaris);
  return async (name: string, params: Record<string, string | number>) => {
    if (z) try { const { t, bound, cap } = prepare(name, params, asOf); return checkCap(name, await z.query(t.lightning, bound, cap + 1), cap); } catch { /* local fallback */ }
    return querySqlite(db, name, params, asOf);
  };
}

type Q = ReturnType<typeof dataQuery>;
type MachineRow = { machine_id: string; type: string; heat_source: string };
// ponytail: in-process cache; the data window is historic, so a range never changes for a given as_of.
const fits = new Map<string, ReturnType<typeof fitOnce>>();
async function fitOnce(q: Q, outlet: string, from: string, to: string, machines: MachineRow[]) {
  const p = { outlet, from: ts(from), to: ts(to) };
  const iv = await q("interval_series", p), cy = await q("cycle_overlap", p);
  if (!iv.length) return undefined;
  const fit = regressMachines(iv as any, cy as any, machines.map((m) => m.machine_id));
  const total = iv.reduce((s, r) => s + Number(r.kwh), 0);
  const byType = (t: string) => fit.machines.filter((f) => machines.find((m) => m.machine_id === f.machine_id)?.type === t).reduce((s, f) => s + f.kwh_per_cycle * f.cycles, 0);
  const washers = byType("washer"), dryers = byType("dryer");
  return {
    // Base = everything the machines don't explain (lights, aircon, standby), so the three parts add up to the meter.
    split: { washers_kwh: washers, dryers_kwh: dryers, base_kwh: Math.max(0, total - washers - dryers), total_kwh: total },
    // The agent's readings: kWh per cycle from the regression, median minutes per cycle for gas dryers (FR-08).
    readings: Object.fromEntries(machines.map((m) => {
      if (m.heat_source === "gas") { const d = durationReading(cy.filter((c) => c.machine_id === m.machine_id && c.started_at >= ts(from)) as any); return [m.machine_id, d.cycles ? { unit: "min", ...d } : null]; }
      const e = fit.machines.find((x) => x.machine_id === m.machine_id);
      return [m.machine_id, e && e.cycles ? { unit: "kWh", value: e.kwh_per_cycle, se: e.se, cycles: e.cycles } : null];
    })) as Record<string, { unit: string; value: number; se: number; cycles: number } | null>,
  };
}
// The same regression the agent runs, over one date range (Owner machine trends, Admin washer vs dryer split).
export function fitRange(q: Q, cfg: Config, asOf: string, outlet: string, from: string, to: string, machines: MachineRow[]) {
  const key = [cfg.dataDir, cfg.mode.data, asOf, outlet, from, to].join("|");
  if (!fits.has(key)) fits.set(key, fitOnce(q, outlet, from, to, machines));
  return fits.get(key)!;
}

// only: one outlet's slice (the Owner app); omitted for the franchise view.
export async function adminOverview(cfg: Config, asOf: string, db: SampleDb = openSampleDb(cfg.dataDir), only?: string) {
  const q = dataQuery(cfg, asOf, db);
  const outlets = (db.prepare("SELECT outlet_id, name FROM outlets ORDER BY outlet_id").all() as { outlet_id: string; name: string }[]).filter((o) => !only || o.outlet_id === only);
  const monthStart = `${asOf.slice(0, 7)}-01` < WINDOW.start ? WINDOW.start : `${asOf.slice(0, 7)}-01`;
  const end = addDays(asOf, 1);
  const daysElapsed = (Date.parse(end) - Date.parse(monthStart)) / 86400000;
  const daysInMonth = new Date(Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)), 0)).getUTCDate();
  const factors = await q("emission_factors", {});
  const grid = Number(factors.find((f) => f.factor_id === "grid_peninsular")?.value);

  const perOutlet = [];
  for (const o of outlets) {
    const rates = ratesFromRows(await q("tariff_rates", { outlet: o.outlet_id }) as any);
    const weeks = await q("tou_split", { outlet: o.outlet_id, from: ts(WINDOW.start), to: ts(end) });
    const month = await q("tou_split", { outlet: o.outlet_id, from: ts(monthStart), to: ts(end) });
    const revenue = await q("cycle_revenue", { outlet: o.outlet_id, from: ts(monthStart), to: ts(end) });
    const kwh = month.reduce((s, r) => s + Number(r.kwh), 0);
    const cost = kwh * rates.flat, rev = revenue.reduce((s, r) => s + Number(r.revenue_rm), 0);
    const tou = touCalc(weeksFromRows(weeks as any), rates);
    const machines = await q("machine_list", { outlet: o.outlet_id }) as MachineRow[];
    const split = (await fitRange(q, cfg, asOf, o.outlet_id, monthStart, end, machines))?.split ?? null;
    perOutlet.push({
      outlet_id: o.outlet_id, name: o.name,
      kpis: { kwh_month_to_date: kwh, cost_rm_month_to_date: cost, revenue_rm_month_to_date: rev, margin_share: rev ? (rev - cost) / rev : 0,
        projected_bill_rm: (cost / daysElapsed) * daysInMonth, cycles_month_to_date: revenue.reduce((s, r) => s + Number(r.cycles), 0) },
      weekly: weeksFromRows(weeks as any).map((w) => ({ week: w.week, peak_kwh: w.peak, offpeak_kwh: w.offpeak })),
      split,
      tariff: { peak_share: tou.peak_share, breakeven: tou.breakeven, verdict: tou.verdict, tou_saving_rm_per_month: tou.saving_per_month },
      scope2: { ...co2Calc({ grid_kwh: kwh, grid_kg_per_kwh: grid }), kwh, factor_kg_per_kwh: grid, period: `${monthStart} to ${asOf}`,
        method: `Grid kWh from the meter × grid emission factor (${factors.find((f) => f.factor_id === "grid_peninsular")?.source}). Prepared for the SEDG GHG calculator; SmartFlux does not file reports.` },
    });
  }

  // Advice scoreboard and flags from H-MEM: what was advised, what the owner decided, what was measured.
  const memory = openHmem(cfg.hmemDir, cfg.logDir).all().filter((m) => m.as_of <= asOf && (!only || m.entities.includes(only)));
  const advice = memory.filter((m) => m.tags.includes("advice")).map((a) => {
    const decision = memory.find((m) => m.tags.includes("decision") && m.data.action_id === a.data.action_id);
    const outcome = memory.filter((m) => m.tags.includes("outcome") && m.data.action_id === a.data.action_id).at(-1);
    return {
      action_id: a.data.action_id, outlet_id: a.entities[0], type: a.data.type, target: a.data.target, advised_as_of: a.as_of,
      risk: a.data.risk, reason: a.data.reason ?? a.content.match(/\(([^()]*)\)$/)?.[1], run_id: a.runId,
      predicted_rm_per_month: a.data.predicted_rm_per_month, status: decision?.data.decision ?? "awaiting_approval",
      verified: outcome ? { verdict: outcome.data.verdict, realised_rm_per_month: outcome.data.realised_rm_per_month, band_rm_per_month: outcome.data.band_rm_per_month, as_of: outcome.as_of } : null,
    };
  });
  const runs = readRuns(cfg.logDir, only ? 200 : 20).filter((r) => !only || r.outlet_id === only).slice(0, 20);
  // Every service the agent proposed up to as_of (from H-MEM), with the fault card of the run that proposed it.
  const allRuns = readRuns(cfg.logDir, 1000);
  const flagged = advice.filter((a) => a.type === "schedule_service").map((a) => {
    const r = allRuns.find((x) => x.run_id === a.run_id);
    const card = r?.decisions.find((d: any) => d.type === "machine_fault" && d.verdict.includes(a.target.split("-").pop()));
    return { outlet_id: a.outlet_id, machine_id: a.target, verdict: card?.verdict, evidence: card?.evidence[0], rm_per_month: card?.rm_per_month ?? a.predicted_rm_per_month,
      status: a.verified ? `verified: ${a.verified.verdict}` : a.status, run_id: a.run_id };
  });

  return {
    as_of: asOf, outlets: perOutlet, flagged_machines: flagged, advice_scoreboard: advice,
    verified_savings_rm_per_month: advice.filter((a) => a.verified?.verdict === "verified").reduce((s, a) => s + a.verified!.realised_rm_per_month, 0),
    run_log: runs.map((r) => ({ run_id: r.run_id, created_at: r.created_at, outlet_id: r.outlet_id, as_of: r.as_of, kind: r.briefing ? "briefing" : "ask",
      question: r.question, intents: r.intents, verdicts: r.decisions?.map((d: any) => d.verdict) ?? [], mode: r.run_mode })),
  };
}

export function scope2Csv(overview: Awaited<ReturnType<typeof adminOverview>>) {
  const rows = overview.outlets.map((o) => [o.outlet_id, o.name, o.scope2.period, o.scope2.kwh.toFixed(1), o.scope2.factor_kg_per_kwh, o.scope2.scope2_tco2e.toFixed(3), `"${o.scope2.method.replace(/"/g, "'")}"`].join(","));
  return ["outlet_id,name,period,grid_kwh,grid_factor_kg_per_kwh,scope2_tco2e,method", ...rows].join("\n") + "\n";
}
