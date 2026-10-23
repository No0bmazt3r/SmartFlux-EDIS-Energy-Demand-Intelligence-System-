// Rules twin of the Investigator: runs the templates and calculators for each open hypothesis and
// turns calculator output into claims. It never states a number it did not compute.
import { durationReading, faultCheck, type MachineReadings, type Reading } from "../../calc/fault.ts";
import { mvCheck } from "../../calc/mv.ts";
import { promoCheck, shiftPlan } from "../../calc/shift.ts";
import { approvedTargets, recallApproved, recallBaselines } from "../../orchestrator/memory.ts";
import { fitWindow, peerReading } from "./shared.ts";
import { jointDecision } from "../../calc/joint.ts";
import { regressMachines } from "../../calc/regress.ts";
import { solarCalc } from "../../calc/solar.ts";
import { ratesFromRows, touCalc, weeksFromRows } from "../../calc/tou.ts";
import { asOfEnd } from "../../templates/index.ts";
import { capsHit } from "../../orchestrator/caps.ts";
import { calc, query, type Ctx } from "../../orchestrator/tools.ts";
import { WINDOW, type Hypothesis, type HypothesisKind, type RunState } from "../../orchestrator/state.ts";
import { addDays, compareWindows, days, fmt, ts, type Range } from "../../orchestrator/windows.ts";

const pct = (x: number) => (x * 100).toFixed(1);
const AGENT = "Investigator";

function claim(state: RunState, h: Hypothesis, text: string, data: Record<string, any>, evidence: string[]) {
  state.claims.push({ id: `c${state.claims.length + 1}`, hypothesis_id: h.id, kind: h.kind, text, data, evidence, status: "proposed" });
}

// The outlet's machine registry, record and tariff, fetched once per run and shared by every recipe.
async function outletBasics(state: RunState, ctx: Ctx) {
  if (state.analysis?.basics) return state.analysis.basics as Record<"machines" | "info" | "tariffs", Awaited<ReturnType<typeof query>>>;
  const outlet = state.outlet_id;
  const basics = {
    machines: await query(state, ctx, AGENT, "machine_list", { outlet }),
    info: await query(state, ctx, AGENT, "outlet_info", { outlet }),
    tariffs: await query(state, ctx, AGENT, "tariff_rates", { outlet }),
  };
  state.analysis = { ...state.analysis, basics };
  return basics;
}

function ruleOut(state: RunState, ctx: Ctx, h: Hypothesis, reason: string) {
  h.status = "rejected";
  h.reason = reason;
  ctx.emit({ agent_name: AGENT, action: "rule_out", input_summary: h.text, output_summary: reason, target_agent: "Planner" });
}

async function investigateTou(state: RunState, ctx: Ctx, h: Hypothesis) {
  const split = await query(state, ctx, AGENT, "tou_split", { outlet: state.outlet_id, from: ts(WINDOW.start), to: asOfEnd(state.as_of) });
  const tariffs = await query(state, ctx, AGENT, "tariff_rates", { outlet: state.outlet_id });
  const tou = calc(state, ctx, AGENT, "tou_calc", `${split.rows.length} week/period rows, ${tariffs.rows.length} tariff rows`,
    () => touCalc(weeksFromRows(split.rows as any), ratesFromRows(tariffs.rows as any)),
    (r) => `peak ${pct(r.peak_share)}% vs breakeven ${pct(r.breakeven)}%, worst week ${r.worst_week.week} ${pct(r.worst_week.peak_share)}%, verdict ${r.verdict}, ToU-flat RM${(-r.saving_per_month).toFixed(2)}/month`,
    "Skeptic");
  claim(state, h, `Tariff verdict: ${tou.out.verdict}`, tou.out, [split.id, tariffs.id, tou.id]);
}

// Solar options and the grid-only tariff verdict, on the outlet's load and real radiation up to as_of.
async function energyInputs(state: RunState, ctx: Ctx) {
  if (state.analysis?.energy) return state.analysis.energy;
  const outlet = state.outlet_id;
  const inputs = await query(state, ctx, AGENT, "solar_inputs", { outlet, from: ts(WINDOW.start), to: asOfEnd(state.as_of) });
  const params = await query(state, ctx, AGENT, "solar_params", { outlet });
  const tariffs = await query(state, ctx, AGENT, "tariff_rates", { outlet });
  const rates = ratesFromRows(tariffs.rows as any);
  const solar = calc(state, ctx, AGENT, "solar_calc", `${inputs.rows.length} half-hours with radiation, roof ≤ ${params.rows[0].roof_kwp_max} kWp`,
    () => solarCalc(inputs.rows as any, params.rows[0] as any, rates.flat),
    (r) => r.possible ? r.options.map((o) => `${o.kwp} kWp RM${o.saving_flat_rm_per_month.toFixed(0)}/mo payback ${o.payback_years.toFixed(1)}y self-use ${(o.self_use_share * 100).toFixed(0)}%`).join("; ") + `; recommend ${r.recommended_kwp ?? "none"}` : "no roof: solar not possible");
  const grid = calc(state, ctx, AGENT, "tou_calc", "grid-only load", () => touCalc(solar.out.grid_weeks, rates),
    (r) => `grid-only: peak ${pct(r.peak_share)}%, verdict ${r.verdict}, ToU-flat RM${(-r.saving_per_month).toFixed(2)}/month`);
  state.analysis = { ...state.analysis, energy: { solar: solar.out, grid: grid.out, rates, evidence: [inputs.id, params.id, tariffs.id, solar.id, grid.id] } };
  return state.analysis.energy;
}

// First pass composes the two decisions independently (ToU on today's load + solar on the flat tariff).
// If the Skeptic sends that back because the decisions interact, the revision decides them jointly.
async function investigateEnergy(state: RunState, ctx: Ctx, h: Hypothesis) {
  const e = await energyInputs(state, ctx);
  const rec = e.solar.options.find((o: any) => o.kwp === e.solar.recommended_kwp);
  if (!rec) return claim(state, h, `Solar not possible or not worth it; tariff verdict ${e.grid.verdict}`, { composition: "grid_only", solar: e.solar, grid: e.grid }, e.evidence);
  const revising = state.claims.some((c) => c.hypothesis_id === h.id && c.status === "rejected");
  if (!revising) {
    const tou = e.grid.verdict === "stay" ? 0 : e.grid.saving_per_month;
    return claim(state, h, `Switch to ToU (RM${tou.toFixed(2)}) and add ${rec.kwp} kWp solar (RM${rec.saving_flat_rm_per_month.toFixed(2)}): RM${(tou + rec.saving_flat_rm_per_month).toFixed(2)}/month`,
      { composition: "sum", kwp: rec.kwp, tou_saving: tou, solar_saving: rec.saving_flat_rm_per_month, total: tou + rec.saving_flat_rm_per_month, solar: e.solar, grid: e.grid }, e.evidence);
  }
  const post = calc(state, ctx, AGENT, "tou_calc", `post-solar load (${rec.kwp} kWp)`, () => touCalc(rec.post_solar_weeks, e.rates),
    (r) => `post-solar: peak ${pct(r.peak_share)}%, verdict ${r.verdict}, ToU-flat RM${(-r.saving_per_month).toFixed(2)}/month`);
  const joint = calc(state, ctx, AGENT, "joint_decision", `flat, ToU, solar+flat, solar+ToU on the same load`, () => jointDecision(e.grid, post.out, rec.kwp),
    (j) => `best ${j.best.option} RM${j.best.saving_rm_per_month.toFixed(2)}/month; naive sum RM${j.naive_sum_rm_per_month.toFixed(2)} overstates by RM${j.overstatement_rm_per_month.toFixed(2)}`, "Skeptic");
  claim(state, h, `Best plan: ${joint.out.best.option} with ${rec.kwp} kWp, RM${joint.out.best.saving_rm_per_month.toFixed(2)}/month`,
    { composition: "joint", kwp: rec.kwp, joint: joint.out, post: post.out, solar: e.solar, grid: e.grid }, [...e.evidence, post.id, joint.id]);
}

// One machine analysis shared by every machine and bill hypothesis. Baselines come from H-MEM when it has
// them; otherwise they are learned from the first full week (and the Reporter stores them). The current
// period is the 14 days to as_of. Then median cycle minutes and fault_check across all dryers.
async function machineAnalysis(state: RunState, ctx: Ctx) {
  if (state.analysis?.machines) return state.analysis.machines;
  const w = compareWindows(state.as_of);
  const learnOnly = !w && state.as_of >= addDays(WINDOW.start, 6);
  if (!w && !learnOnly) return undefined;
  const outlet = state.outlet_id;
  const range = (r: Range) => ({ outlet, from: ts(r.from), to: ts(r.to) });
  const label = (r: Range) => `${fmt(r.from)}–${fmt(addDays(r.to, -1))}`;
  const fitSummary = (r: ReturnType<typeof regressMachines>) => `R² ${r.r2.toFixed(3)}, ${r.machines.length} machines, base ${(r.base_kwh_per_interval * 2).toFixed(2)} kW`;
  const { machines, info, tariffs } = await outletBasics(state, ctx);
  const ids = machines.rows.map((m) => m.machine_id as string);
  const dryers = machines.rows.filter((m) => m.type === "dryer");
  const startedIn = (rows: any[], id: string, r: Range) => rows.filter((c) => c.machine_id === id && c.started_at >= ts(r.from) && c.started_at < ts(r.to));
  const perDay = (rows: any[]) => rows.reduce((s, x) => s + Number(x.kwh), 0) / (rows.length / 48 || 1);
  const cyclesPerDay = (rows: any[], r: Range) => rows.filter((c) => c.started_at >= ts(r.from) && c.started_at < ts(r.to)).length / days(r);

  const mem = learnOnly ? undefined : recallBaselines(state, ctx, AGENT);
  const fromMemory = !!mem?.outlet && dryers.every((m) => mem.machines.has(m.machine_id));
  const evidence: string[] = [machines.id];
  let baseline: Range, base: Map<string, { kwh?: Reading; minutes: Reading }>, outletBase: { kwh_per_day: number; cycles_per_day: number; avg_kwh_per_cycle: number };
  if (fromMemory) {
    baseline = mem!.outlet!.data.window;
    base = new Map([...mem!.machines].map(([id, m]) => [id, { kwh: m.data.kwh, minutes: m.data.minutes }]));
    outletBase = mem!.outlet!.data as any;
  } else {
    baseline = w?.baseline ?? { from: WINDOW.start, to: addDays(WINDOW.start, 7) };
    const ivB = await query(state, ctx, AGENT, "interval_series", range(baseline));
    const cyB = await query(state, ctx, AGENT, "cycle_overlap", range(baseline));
    const fitB = calc(state, ctx, AGENT, "regress_machines", `baseline ${label(baseline)}`, () => regressMachines(ivB.rows as any, cyB.rows as any, ids), fitSummary);
    base = new Map(dryers.map((m) => {
      const e = fitB.out.machines.find((x) => x.machine_id === m.machine_id);
      return [m.machine_id, { kwh: e && { value: e.kwh_per_cycle, se: e.se, cycles: e.cycles }, minutes: durationReading(startedIn(cyB.rows, m.machine_id, baseline)) }];
    }));
    outletBase = {
      kwh_per_day: perDay(ivB.rows), cycles_per_day: cyclesPerDay(cyB.rows, baseline),
      avg_kwh_per_cycle: fitB.out.machines.reduce((s, m) => s + m.kwh_per_cycle * m.cycles, 0) / (fitB.out.machines.reduce((s, m) => s + m.cycles, 0) || 1),
    };
    evidence.push(ivB.id, cyB.id, fitB.id);
  }
  const rates = ratesFromRows(tariffs.rows as any);
  const lpg = Number(info.rows[0].lpg_rm_per_dryer_minute);
  const common = {
    rates, lpg, names: Object.fromEntries(machines.rows.map((m) => [m.machine_id, m.name])),
    heat: Object.fromEntries(machines.rows.map((m) => [m.machine_id, m.heat_source])),
    baseline_source: fromMemory ? "memory" : "computed", baseline_as_of: fromMemory ? mem!.outlet!.as_of : addDays(baseline.to, -1), baseline_label: `week of ${label(baseline)}`,
  };

  if (learnOnly) {
    const readings = dryers.map((m) => {
      const b = base.get(m.machine_id)!;
      return { machine_id: m.machine_id, name: m.name, heat_source: m.heat_source, kwh_baseline: b.kwh, minutes_baseline: b.minutes, minutes: { baseline: b.minutes.value } };
    });
    state.analysis = { ...state.analysis, machines: { ...common, learn_only: true, windows: { baseline }, readings,
      kwh_per_day: { baseline: outletBase.kwh_per_day }, cycles_per_day: { baseline: outletBase.cycles_per_day }, avg_kwh_per_cycle: outletBase.avg_kwh_per_cycle,
      evidence: { regression: evidence, faults: evidence.at(-1) } } };
    return state.analysis.machines;
  }
  const current = w!.current;
  const ivC = await query(state, ctx, AGENT, "interval_series", range(current));
  const cyC = await query(state, ctx, AGENT, "cycle_overlap", range(current));
  const fitC = calc(state, ctx, AGENT, "regress_machines", `current ${label(current)}`, () => regressMachines(ivC.rows as any, cyC.rows as any, ids), fitSummary);
  evidence.push(ivC.id, cyC.id, fitC.id);
  const readings: (MachineReadings & Record<string, any>)[] = [];
  for (const m of dryers) {
    const b = base.get(m.machine_id), eC = fitC.out.machines.find((x) => x.machine_id === m.machine_id);
    const durC = durationReading(startedIn(cyC.rows, m.machine_id, current));
    if (!b || !eC || !b.kwh || !durC.cycles) continue;
    const gas = m.heat_source === "gas";
    readings.push({
      machine_id: m.machine_id, name: m.name, type: "dryer", heat_source: m.heat_source,
      baseline: gas ? b.minutes : b.kwh, current: gas ? durC : { value: eC.kwh_per_cycle, se: eC.se, cycles: eC.cycles },
      kwh_baseline: b.kwh, minutes_baseline: b.minutes, minutes: { baseline: b.minutes.value, current: durC.value },
    });
  }
  const faults = calc(state, ctx, AGENT, "fault_check", `${readings.length} dryers, current vs ${fromMemory ? `H-MEM baseline (as of ${common.baseline_as_of})` : "baseline week"}`,
    () => faultCheck(readings, { days: days(current), rateRmPerKwh: rates.flat, lpgRmPerMinute: lpg }),
    (rs) => rs.filter((r) => r.flagged).map((r) => `${r.machine_id} ${r.delta_pct.toFixed(0)}% ${r.metric} (peers ${r.peer_delta_pct.toFixed(0)}%)`).join("; ") || "no dryer flagged",
    "Skeptic");
  state.analysis = { ...state.analysis, machines: {
    ...common, windows: { baseline, current }, readings, faults: faults.out,
    kwh_per_day: { baseline: outletBase.kwh_per_day, current: perDay(ivC.rows) },
    cycles_per_day: { baseline: outletBase.cycles_per_day, current: cyclesPerDay(cyC.rows, current) },
    avg_kwh_per_cycle: outletBase.avg_kwh_per_cycle,
    evidence: { regression: evidence, faults: faults.id },
  } };
  return state.analysis.machines;
}

async function needWindows(state: RunState, ctx: Ctx, h: Hypothesis) {
  const a = await machineAnalysis(state, ctx);
  if (a?.learn_only && h.kind === "fault") {
    claim(state, h, `Normal levels learned for ${a.readings.length} dryers`, { learned: true, readings: a.readings, names: a.names, windows: a.windows }, a.evidence.regression);
    return undefined;
  }
  if (!a || a.learn_only) {
    h.status = "unresolved";
    state.unresolved.push(`${h.text}: needs at least two weeks of data after the baseline week (${fmt(WINDOW.start)}–${fmt("2026-09-13")})`);
  }
  return a;
}

async function investigateBill(state: RunState, ctx: Ctx, h: Hypothesis) {
  const a = await needWindows(state, ctx, h);
  if (!a) return;
  const { baseline, current } = a.kwh_per_day;
  claim(state, h, `Energy use ${current >= baseline ? "rose" : "fell"} ${Math.abs((current / baseline - 1) * 100).toFixed(1)}% per day`,
    { kwh_per_day: a.kwh_per_day, delta_pct: (current / baseline - 1) * 100, windows: a.windows }, a.evidence.regression.slice(0, 3));
}

async function investigateFault(state: RunState, ctx: Ctx, h: Hypothesis) {
  const a = await needWindows(state, ctx, h);
  if (!a) return;
  const flagged = a.faults.filter((f: any) => f.flagged);
  for (const f of flagged) {
    const r = a.readings.find((x: any) => x.machine_id === f.machine_id);
    claim(state, h, `${a.names[f.machine_id]} is faulty: ${f.metric} +${f.delta_pct.toFixed(0)}%`,
      { ...f, name: a.names[f.machine_id], minutes: r.minutes, windows: a.windows, rate: a.rates.flat, lpg: a.lpg },
      [...a.evidence.regression, a.evidence.faults]);
  }
  if (!flagged.length)
    claim(state, h, "No dryer is outside its normal range", { none: true, faults: a.faults, names: a.names, windows: a.windows }, [a.evidence.faults]);
}

async function investigateHumidity(state: RunState, ctx: Ctx, h: Hypothesis) {
  const a = await needWindows(state, ctx, h);
  if (!a) return;
  const electric = a.faults.filter((f: any) => f.heat_source === "electric");
  if (!electric.length) return ruleOut(state, ctx, h, "Gas dryers: the meter doesn't see burner energy, so humidity can't explain an electricity rise");
  const w = a.windows;
  const rh = async (r: Range) => {
    const q = await query(state, ctx, AGENT, "weather_range", { outlet: state.outlet_id, from: ts(r.from), to: ts(r.to) });
    return { mean: q.rows.reduce((s, x) => s + Number(x.relative_humidity), 0) / (q.rows.length || 1), id: q.id };
  };
  const rhB = await rh(w.baseline), rhC = await rh(w.current);
  const dryerDelta = electric.reduce((s: number, f: any) => s + f.delta_pct, 0) / electric.length;
  if (rhC.mean - rhB.mean < 1) return ruleOut(state, ctx, h, `Humidity was not higher (${rhB.mean.toFixed(0)}% → ${rhC.mean.toFixed(0)}%)`);
  if (dryerDelta < 2) return ruleOut(state, ctx, h, `Dryers' energy per cycle didn't rise on average (${dryerDelta.toFixed(1)}%)`);
  claim(state, h, `Humid weather raised dryer energy (humidity ${rhB.mean.toFixed(0)}% → ${rhC.mean.toFixed(0)}%, dryers +${dryerDelta.toFixed(0)}% on average)`,
    { rh: { baseline: rhB.mean, current: rhC.mean }, dryer_delta_pct: dryerDelta, windows: w }, [rhB.id, rhC.id, a.evidence.faults]);
}

async function investigateTraffic(state: RunState, ctx: Ctx, h: Hypothesis) {
  const a = await needWindows(state, ctx, h);
  if (!a) return;
  const { baseline, current } = a.cycles_per_day;
  const delta = (current / baseline - 1) * 100;
  if (Math.abs(delta) < 5) return ruleOut(state, ctx, h, `Customer numbers barely changed (${baseline.toFixed(0)} → ${current.toFixed(0)} cycles/day, ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)`);
  claim(state, h, `${delta > 0 ? "More" : "Fewer"} customers: ${baseline.toFixed(0)} → ${current.toFixed(0)} cycles/day`,
    { cycles_per_day: a.cycles_per_day, delta_pct: delta, kwh_per_day: (current - baseline) * a.avg_kwh_per_cycle, windows: a.windows }, a.evidence.regression.slice(0, 4));
}

async function investigateHoliday(state: RunState, ctx: Ctx, h: Hypothesis) {
  const w = compareWindows(state.as_of);
  if (!w) return await needWindows(state, ctx, h);
  const inPeriod = await query(state, ctx, AGENT, "holidays_range", { from: w.current.from, to: w.current.to });
  if (inPeriod.rows.length)
    return claim(state, h, `Public holiday in the period: ${inPeriod.rows.map((x) => `${x.name} (${fmt(x.date)})`).join(", ")}`, { holidays: inPeriod.rows, windows: w }, [inPeriod.id]);
  const before = await query(state, ctx, AGENT, "holidays_range", { from: w.baseline.from, to: w.current.from });
  ruleOut(state, ctx, h, before.rows.length
    ? `${before.rows.map((x) => `${x.name} (${fmt(x.date)})`).join(", ")} fell before the period compared, so it can't explain it`
    : "No public holiday in the period");
}

// Load-shift plan: which off-peak slot has idle dryers, and what moving some peak dryer use there is worth.
async function investigateShift(state: RunState, ctx: Ctx, h: Hypothesis) {
  const { machines, tariffs } = await outletBasics(state, ctx);
  const w: Range = { from: [addDays(state.as_of, -27), WINDOW.start].sort().at(-1)!, to: addDays(state.as_of, 1) };
  const fit = await fitWindow(state, ctx, AGENT, w, machines.rows as any, "load shape");
  const hol = await query(state, ctx, AGENT, "holidays_range", { from: w.from, to: w.to });
  const dryers = machines.rows.filter((m) => m.type === "dryer");
  const ids = new Set(dryers.map((d) => d.machine_id));
  const starts = fit.cycles.filter((c) => ids.has(c.machine_id) && c.started_at >= ts(w.from));
  const kwh = dryers.map((d) => fit.reading(d.machine_id)).filter(Boolean);
  const electric = dryers.filter((d) => d.heat_source === "electric").map((d) => fit.reading(d.machine_id)?.value ?? 0);
  const plan = calc(state, ctx, AGENT, "shift_plan", `${starts.length} dryer cycles over ${days(w)} days`, () => shiftPlan({
    dryerStarts: starts.map((c) => c.started_at), dryerMinutes: starts.map((c) => (Date.parse(c.ended_at.replace(" ", "T") + "Z") - Date.parse(c.started_at.replace(" ", "T") + "Z")) / 60000),
    dryers: dryers.length, kwhPerCycle: electric.length ? electric.reduce((s, x) => s + x, 0) / electric.length : 0.35,
    rates: ratesFromRows(tariffs.rows as any), days: days(w), holidays: new Set(hol.rows.map((x) => x.date)),
  }), (r) => `${r.slot.day} ${r.slot.hour}:00 has ${(r.slot.idle_share * 100).toFixed(0)}% idle dryers; shift ${r.shiftable_cycles_per_week.toFixed(1)} cycles/week = RM${r.saving_rm_per_month.toFixed(2)}/month on ToU`, "Skeptic");
  if (!kwh.length) return ruleOut(state, ctx, h, "No dryer use to shift");
  claim(state, h, `Off-peak promo: ${plan.out.slot.day} from ${plan.out.slot.hour}:00`, { ...plan.out, window: w, gas: dryers.every((d) => d.heat_source === "gas") }, [...fit.evidence, hol.id, plan.id]);
}

// Off-peak share of one outlet over a range, from the same period split the tariff uses.
async function offpeakShare(state: RunState, ctx: Ctx, outlet: string, r: Range) {
  const q = await query(state, ctx, AGENT, "tou_split", { outlet, from: ts(r.from), to: ts(r.to) });
  const off = q.rows.filter((x) => x.period === "offpeak").reduce((s, x) => s + Number(x.kwh), 0), all = q.rows.reduce((s, x) => s + Number(x.kwh), 0);
  return all ? off / all : 0;
}

// Did approved advice work? Servicing actions are checked with mv_check: the machine before vs after its
// service date, minus the same change in its peers. Predictions come from H-MEM; without an approval in
// memory, services in the service log are checked against a prediction re-derived from the baseline.
async function investigateVerify(state: RunState, ctx: Ctx, h: Hypothesis) {
  const outlet = state.outlet_id;
  const approvedAll = recallApproved(state, ctx, AGENT);
  const approved = approvedAll.filter((m) => m.data.type === "schedule_service");
  // Approved promos: off-peak share after the approval vs before, against the other outlets.
  for (const p of approvedAll.filter((m) => m.data.type === "run_promo")) {
    const before: Range = { from: WINDOW.start, to: addDays(p.as_of, 1) }, afterR: Range = { from: addDays(p.as_of, 1), to: addDays(state.as_of, 1) };
    const peers = (await query(state, ctx, AGENT, "outlet_list", {})).rows.map((o) => o.outlet_id).filter((o) => o !== outlet);
    const mean = async (r: Range) => { let s = 0; for (const o of peers) s += await offpeakShare(state, ctx, o, r); return s / peers.length; };
    const res = promoCheck({ before: await offpeakShare(state, ctx, outlet, before), after: await offpeakShare(state, ctx, outlet, afterR),
      peersBefore: await mean(before), peersAfter: await mean(afterR), postDays: days(afterR) });
    const mv = calc(state, ctx, AGENT, "promo_check", `${p.data.target} since ${fmt(p.as_of)} vs ${peers.length} other outlets`, () => res,
      (r) => `${r.verdict}: off-peak share ${r.offpeak_share_change_pts >= 0 ? "+" : ""}${r.offpeak_share_change_pts.toFixed(1)} pts vs the other outlets`, "Skeptic");
    claim(state, h, `Promo ${p.data.target}: ${res.verdict}`, { promo: true, name: p.data.target, action_id: p.data.action_id, approved_as_of: p.as_of, result: res, windows: { before, after: afterR } }, [mv.id]);
  }
  const { machines, info, tariffs } = await outletBasics(state, ctx);
  const rate = ratesFromRows(tariffs.rows as any).flat, lpg = Number(info.rows[0].lpg_rm_per_dryer_minute);
  type Target = { machine_id: string; action_id?: string; predicted?: number; serviced_on?: string };
  let targets: Target[];
  if (approved.length) {
    targets = [];
    for (const m of approved) {
      const s = await query(state, ctx, AGENT, "service_history", { machine: m.data.target });
      const after = s.rows.filter((x) => x.serviced_on >= m.as_of);
      targets.push({ machine_id: m.data.target, action_id: m.data.action_id, predicted: m.data.predicted_rm_per_month, serviced_on: after.at(-1)?.serviced_on });
    }
  } else {
    const s = await query(state, ctx, AGENT, "services_range", { outlet, from: WINDOW.start, to: addDays(state.as_of, 1) });
    const known = approvedTargets(state, ctx); // already tracked through an approval (its outcome is in memory)
    targets = s.rows.filter((x) => !known.has(x.machine_id)).map((x) => ({ machine_id: x.machine_id, serviced_on: x.serviced_on }));
  }
  if (!targets.length) {
    if (state.claims.some((c) => c.hypothesis_id === h.id)) return; // promo claims only
    return ruleOut(state, ctx, h, "No approved service is waiting to be verified, and no service is recorded in the period");
  }
  const dryers = machines.rows.filter((m) => m.type === "dryer") as { machine_id: string; heat_source: string; name: string }[];
  for (const tg of targets) {
    const m = dryers.find((d) => d.machine_id === tg.machine_id);
    if (!m) continue;
    const base = { machine_id: m.machine_id, name: m.name, heat_source: m.heat_source, action_id: tg.action_id, serviced_on: tg.serviced_on, predicted_source: tg.predicted ? "memory" : "re-derived" };
    if (!tg.serviced_on) {
      claim(state, h, `${m.name} has not been serviced yet`, { ...base, mv: { verdict: "not_yet", post_days: 0 } }, [machines.id]);
      continue;
    }
    const pre: Range = { from: addDays(tg.serviced_on, -14), to: tg.serviced_on };
    const post: Range = { from: addDays(tg.serviced_on, 1), to: addDays(state.as_of, 1) };
    const peers = dryers.filter((d) => d.machine_id !== m.machine_id && d.heat_source === m.heat_source);
    const before = await fitWindow(state, ctx, AGENT, pre, machines.rows as any, "before service");
    const after = await fitWindow(state, ctx, AGENT, post, machines.rows as any, "after service");
    const unit = m.heat_source === "gas" ? lpg : rate;
    const cyclesPerMonth = (after.cyclesStarted(m.machine_id) / days(post)) * (365.25 / 12);
    let predicted = tg.predicted;
    if (!predicted) {
      const mem = recallBaselines(state, ctx, AGENT).machines.get(m.machine_id);
      const baseline = (m.heat_source === "gas" ? mem?.data.minutes : mem?.data.kwh)
        ?? (await fitWindow(state, ctx, AGENT, { from: WINDOW.start, to: addDays(WINDOW.start, 7) }, machines.rows as any, "baseline")).reading(m.machine_id);
      predicted = Math.max(0, (before.reading(m.machine_id)!.value - baseline!.value) * cyclesPerMonth * unit);
    }
    const readings = {
      machine: { pre: before.reading(m.machine_id)!, post: after.reading(m.machine_id)! },
      peers: { pre: peerReading(peers.map((p) => before.reading(p.machine_id))), post: peerReading(peers.map((p) => after.reading(p.machine_id))) },
    };
    const mv = calc(state, ctx, AGENT, "mv_check", `${m.name} serviced ${fmt(tg.serviced_on)}: before vs after, minus peers`,
      () => mvCheck({ ...readings, predicted_rm_per_month: predicted!, cycles_per_month: cyclesPerMonth, unit_cost_rm: unit, post_days: days(post) }),
      (r) => `${r.verdict}: realised RM${r.realised_rm_per_month.toFixed(2)} ± ${r.band_rm_per_month.toFixed(2)} vs predicted RM${r.predicted_rm_per_month.toFixed(2)}`, "Skeptic");
    claim(state, h, `${m.name} service: ${mv.out.verdict}`, { ...base, mv: mv.out, windows: { pre, post }, unit_cost: unit, readings },
      [...before.evidence, ...after.evidence, mv.id]);
  }
}

const RECIPES: Record<HypothesisKind, (s: RunState, c: Ctx, h: Hypothesis) => Promise<unknown>> = {
  tou: investigateTou, energy: investigateEnergy, bill: investigateBill, fault: investigateFault, humidity: investigateHumidity, traffic: investigateTraffic, holiday: investigateHoliday, verify: investigateVerify, shift: investigateShift,
};

export async function investigator(state: RunState, ctx: Ctx) {
  for (const h of state.hypotheses.filter((h) => h.status === "open")) {
    if (state.claims.some((c) => c.hypothesis_id === h.id && c.status !== "rejected")) continue;
    if (capsHit(state)) return;
    await RECIPES[h.kind](state, ctx, h);
  }
}
