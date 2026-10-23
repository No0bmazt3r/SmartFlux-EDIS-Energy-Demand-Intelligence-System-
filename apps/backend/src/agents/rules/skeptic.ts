// Rules twin of the Skeptic: re-derives every claim with its own queries before the Reporter may use it.
// Outcomes: approve; rule out (the hypothesis fails a causal check); or send back for revision.
import { durationReading } from "../../calc/fault.ts";
import { jointDecision } from "../../calc/joint.ts";
import { regressMachines } from "../../calc/regress.ts";
import { solarCalc } from "../../calc/solar.ts";
import { fitWindow } from "./shared.ts";
import { ratesFromRows, touCalc, weeksFromRows, type TouResult } from "../../calc/tou.ts";
import { asOfEnd } from "../../templates/index.ts";
import { rejectionCapHit } from "../../orchestrator/caps.ts";
import { calc, query, type Ctx } from "../../orchestrator/tools.ts";
import { WINDOW, type Claim, type HypothesisKind, type RunState } from "../../orchestrator/state.ts";
import { days, ts, type Range } from "../../orchestrator/windows.ts";

type Verdict = { ok: true; note?: string } | { ok: false; ruleOut?: boolean; reason: string };
const AGENT = "Skeptic";
const pct = (x: number) => (x * 100).toFixed(1);
const close = (a: number, b: number, tol = 0.005) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

function verifyTou(state: RunState, ctx: Ctx, claim: Claim): Verdict {
  const claimed = claim.data as TouResult;
  const split = query(state, ctx, AGENT, "tou_split", { outlet: state.outlet_id, from: ts(WINDOW.start), to: asOfEnd(state.as_of) });
  const tariffs = query(state, ctx, AGENT, "tariff_rates", { outlet: state.outlet_id });
  const { out: re } = calc(state, ctx, AGENT, "tou_calc", "verification recompute",
    () => touCalc(weeksFromRows(split.rows as any), ratesFromRows(tariffs.rows as any)),
    (r) => `verdict ${r.verdict}, ToU-flat RM${(-r.saving_per_month).toFixed(2)}/month`);
  if (!close(re.saving_per_month, claimed.saving_per_month) || !close(re.peak_share, claimed.peak_share))
    return { ok: false, reason: `numbers do not reproduce from the data (claimed RM${claimed.saving_per_month.toFixed(2)}, re-derived RM${re.saving_per_month.toFixed(2)})` };
  if (claimed.verdict === "switch" && re.weeks.some((w) => w.peak_share >= re.breakeven))
    return { ok: false, reason: `verdict "switch" but week ${re.worst_week.week} is above break-even` };
  if (re.verdict !== claimed.verdict) return { ok: false, reason: `verdict should be "${re.verdict}", not "${claimed.verdict}"` };
  return { ok: true };
}

// Re-derives solar and the tariff on the post-solar load with its own queries. A plan that adds a ToU saving
// computed on today's load to a solar saving is a double count whenever solar moves the peak share.
function verifyEnergy(state: RunState, ctx: Ctx, claim: Claim): Verdict {
  const d = claim.data;
  const outlet = state.outlet_id;
  const inputs = query(state, ctx, AGENT, "solar_inputs", { outlet, from: ts(WINDOW.start), to: asOfEnd(state.as_of) });
  const params = query(state, ctx, AGENT, "solar_params", { outlet });
  const tariffs = query(state, ctx, AGENT, "tariff_rates", { outlet });
  const rates = ratesFromRows(tariffs.rows as any);
  const { out: solar } = calc(state, ctx, AGENT, "solar_calc", "verification recompute", () => solarCalc(inputs.rows as any, params.rows[0] as any, rates.flat),
    (r) => `recommend ${r.recommended_kwp ?? "none"} kWp`);
  const { out: grid } = calc(state, ctx, AGENT, "tou_calc", "grid-only, verification", () => touCalc(solar.grid_weeks, rates), (r) => `grid-only verdict ${r.verdict}`);
  if (d.composition === "grid_only")
    return solar.recommended_kwp === undefined && grid.verdict === d.grid.verdict ? { ok: true } : { ok: false, reason: "solar or tariff verdict does not reproduce" };
  const rec = solar.options.find((o) => o.kwp === d.kwp);
  if (!rec || solar.recommended_kwp !== d.kwp) return { ok: false, reason: `recommended size should be ${solar.recommended_kwp ?? "none"} kWp` };
  const { out: post } = calc(state, ctx, AGENT, "tou_calc", `post-solar load (${d.kwp} kWp), verification`, () => touCalc(rec.post_solar_weeks, rates),
    (r) => `post-solar peak ${pct(r.peak_share)}%, verdict ${r.verdict}`);
  if (d.composition === "sum") {
    // A summed plan is never accepted: it compares two of the four options, and double-counts when they interact.
    if (d.tou_saving > 0 && !close(post.saving_per_month, grid.saving_per_month, 0.05))
      return { ok: false, reason: `RM${d.tou_saving.toFixed(2)} + RM${d.solar_saving.toFixed(2)} = RM${d.total.toFixed(2)} adds two savings that overlap: solar moves the peak share from ${pct(grid.peak_share)}% to ${pct(post.peak_share)}%, where ToU ${post.saving_per_month > 0 ? `saves only RM${post.saving_per_month.toFixed(2)}` : `costs RM${(-post.saving_per_month).toFixed(2)} more`}; recompute jointly` };
    return { ok: false, reason: "only two of the four options were compared; compare flat, ToU, solar + flat and solar + ToU on the same load" };
  }
  const { out: joint } = calc(state, ctx, AGENT, "joint_decision", "verification recompute", () => jointDecision(grid, post, d.kwp), (j) => `best ${j.best.option} RM${j.best.saving_rm_per_month.toFixed(2)}`);
  if (joint.best.option !== d.joint.best.option || !close(joint.best.saving_rm_per_month, d.joint.best.saving_rm_per_month))
    return { ok: false, reason: `joint decision does not reproduce (${joint.best.option} RM${joint.best.saving_rm_per_month.toFixed(2)})` };
  return { ok: true, note: `joint plan re-derived: ${joint.best.option} RM${joint.best.saving_rm_per_month.toFixed(2)}/month` };
}

// Re-checks the service date and the after-service level with its own queries.
function verifyVerify(state: RunState, ctx: Ctx, claim: Claim): Verdict {
  const d = claim.data;
  const s = query(state, ctx, AGENT, "service_history", { machine: d.machine_id });
  if (!d.serviced_on) return s.rows.length && s.rows.at(-1)!.serviced_on >= (d.advised_as_of ?? "") && d.action_id ? { ok: false, reason: "a service is recorded; verify it" } : { ok: true, note: "no service recorded yet" };
  if (!s.rows.some((x) => x.serviced_on === d.serviced_on)) return { ok: false, reason: `no service on ${d.serviced_on} in the service log` };
  const machines = query(state, ctx, AGENT, "machine_list", { outlet: state.outlet_id });
  const after = fitWindow(state, ctx, AGENT, d.windows.post, machines.rows as any, "after service, verification");
  const post = after.reading(d.machine_id)!;
  if (!close(post.value, d.readings.machine.post.value, 0.03))
    return { ok: false, reason: `after-service level does not reproduce (${post.value.toFixed(2)} vs ${d.readings.machine.post.value.toFixed(2)})` };
  return { ok: true, note: `after-service level re-derived: ${post.value.toFixed(2)}` };
}

// Energy per day re-derived through a different path (period totals instead of the interval series).
function verifyBill(state: RunState, ctx: Ctx, claim: Claim): Verdict {
  const perDay = (r: Range) => {
    const q = query(state, ctx, AGENT, "tou_split", { outlet: state.outlet_id, from: ts(r.from), to: ts(r.to) });
    const kwh = q.rows.reduce((s, x) => s + Number(x.kwh), 0), n = q.rows.reduce((s, x) => s + Number(x.intervals), 0);
    return kwh / (n / 48);
  };
  const b = perDay(claim.data.windows.baseline), c = perDay(claim.data.windows.current);
  if (!close(b, claim.data.kwh_per_day.baseline, 0.01) || !close(c, claim.data.kwh_per_day.current, 0.01))
    return { ok: false, reason: `kWh per day does not reproduce (${b.toFixed(1)} → ${c.toFixed(1)})` };
  return { ok: true };
}

function verifyFault(state: RunState, ctx: Ctx, claim: Claim): Verdict {
  const d = claim.data;
  if (d.none) return { ok: true, note: "no flags to verify" };
  if (d.learned) return { ok: true, note: "baselines learned; nothing to compare yet" };
  if (d.heat_source === "gas" && d.metric !== "minutes_per_cycle")
    return { ok: false, reason: "electric-kWh claim about a gas burner: the meter can't see it; use cycle minutes" };
  const dur = (r: Range) => {
    const q = query(state, ctx, AGENT, "cycle_duration", { machine: d.machine_id, from: ts(r.from), to: ts(r.to) });
    return durationReading(q.rows as any);
  };
  const durB = dur(d.windows.baseline), durC = dur(d.windows.current);
  const cyclesPerMonth = (durC.cycles / days(d.windows.current)) * (365.25 / 12);
  if (!close(cyclesPerMonth, d.cycles_per_month, 0.05))
    return { ok: false, reason: `cycle count does not reproduce (${cyclesPerMonth.toFixed(0)} vs ${d.cycles_per_month.toFixed(0)} per month)` };
  const minutesDelta = durC.value / durB.value - 1;
  if (d.heat_source === "gas" && !close(minutesDelta * 100, d.delta_pct, 0.05))
    return { ok: false, reason: `cycle minutes do not reproduce (+${(minutesDelta * 100).toFixed(0)}% vs +${d.delta_pct.toFixed(0)}%)` };
  if (d.peer_delta_pct >= d.delta_pct / 2)
    return { ok: false, ruleOut: true, reason: `peers rose ${d.peer_delta_pct.toFixed(0)}% too: not a single-machine fault` };
  d.duration_support = minutesDelta >= 0.1;
  return { ok: true, note: d.heat_source === "gas" ? `minutes re-derived: +${(minutesDelta * 100).toFixed(0)}%` : `cycles ${(minutesDelta * 100).toFixed(0)}% longer${d.duration_support ? " (supports the fault)" : " (no duration support: lower confidence)"}` };
}

// Peer check: refit the current window itself and see whether dryers other than the flagged ones rose.
function verifyHumidity(state: RunState, ctx: Ctx, claim: Claim): Verdict {
  const a = state.analysis!.machines;
  const w: Range = claim.data.windows.current;
  const iv = query(state, ctx, AGENT, "interval_series", { outlet: state.outlet_id, from: ts(w.from), to: ts(w.to) });
  const cy = query(state, ctx, AGENT, "cycle_overlap", { outlet: state.outlet_id, from: ts(w.from), to: ts(w.to) });
  const flagged = new Set(a.faults.filter((f: any) => f.flagged).map((f: any) => f.machine_id));
  const peers = a.readings.filter((r: any) => r.heat_source === "electric" && !flagged.has(r.machine_id));
  const { out: fit } = calc(state, ctx, AGENT, "regress_machines", "peer check, current window",
    () => regressMachines(iv.rows as any, cy.rows as any, Object.keys(a.names)), // every machine, or washer energy leaks into the dryers
    (r) => `R² ${r.r2.toFixed(3)}`);
  const deltas = peers.map((p: any) => fit.machines.find((m) => m.machine_id === p.machine_id)!.kwh_per_cycle / p.baseline.value - 1);
  const peerDelta = (deltas.reduce((s: number, x: number) => s + x, 0) / (deltas.length || 1)) * 100;
  claim.data.peer_delta_pct = peerDelta;
  if (flagged.size && peerDelta < 5)
    return { ok: false, ruleOut: true, reason: `other dryers rose only ${peerDelta.toFixed(1)}%; humidity explains a small share, the rest is ${[...flagged].map((id) => a.names[id as string]).join(", ")}` };
  if (peerDelta < 2) return { ok: false, ruleOut: true, reason: `dryers did not rise once refitted (${peerDelta.toFixed(1)}%)` };
  return { ok: true, note: `peers +${peerDelta.toFixed(1)}%` };
}

function verifyTraffic(state: RunState, ctx: Ctx, claim: Claim): Verdict {
  const w: Range = claim.data.windows.current;
  const q = query(state, ctx, AGENT, "cycle_overlap", { outlet: state.outlet_id, from: ts(w.from), to: ts(w.to) });
  const perDay = q.rows.filter((c) => c.started_at >= ts(w.from)).length / days(w);
  return close(perDay, claim.data.cycles_per_day.current, 0.02) ? { ok: true } : { ok: false, reason: `cycles per day do not reproduce (${perDay.toFixed(1)})` };
}

function verifyHoliday(state: RunState, ctx: Ctx, claim: Claim): Verdict {
  const w: Range = claim.data.windows.current;
  const q = query(state, ctx, AGENT, "holidays_range", { from: w.from, to: w.to });
  return q.rows.length ? { ok: true } : { ok: false, ruleOut: true, reason: "no holiday found in the period" };
}

const VERIFIERS: Record<HypothesisKind, (s: RunState, c: Ctx, claim: Claim) => Verdict> = {
  tou: verifyTou, energy: verifyEnergy, bill: verifyBill, fault: verifyFault, humidity: verifyHumidity, traffic: verifyTraffic, holiday: verifyHoliday, verify: verifyVerify,
};

export function skeptic(state: RunState, ctx: Ctx): "approved" | "revise" {
  let revise = false;
  for (const claim of state.claims.filter((c) => c.status === "proposed")) {
    const v = VERIFIERS[claim.kind](state, ctx, claim);
    const h = state.hypotheses.find((x) => x.id === claim.hypothesis_id)!;
    if (v.ok) {
      claim.status = "approved";
      if (h.status === "open") h.status = "supported";
      ctx.emit({ agent_name: AGENT, action: "approve", input_summary: `claim ${claim.id}: ${claim.text}`, output_summary: `re-derived from the data; approved${v.note ? ` (${v.note})` : ""}`, target_agent: "Reporter", confidence: 0.9 });
      continue;
    }
    claim.status = "rejected";
    claim.reason = v.reason;
    state.counters.rejections[h.id] = (state.counters.rejections[h.id] ?? 0) + 1;
    if (v.ruleOut) {
      h.status = "rejected";
      h.reason = v.reason;
    } else if (rejectionCapHit(state, h.id)) {
      h.status = "unresolved";
      state.unresolved.push(`${h.text}: ${v.reason}`);
    } else revise = true;
    ctx.emit({ agent_name: AGENT, action: "verify", input_summary: `claim ${claim.id}: ${claim.text}`,
      output_summary: `Rejected${v.ruleOut ? " (ruled out)" : ""}: ${v.reason}`, target_agent: v.ruleOut ? "Planner" : "Investigator",
      status: "needs_revision", retry_count: state.counters.rejections[h.id] });
  }
  return revise ? "revise" : "approved";
}
