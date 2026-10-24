// SmartFlux's use of H-MEM: what agents remember (machine baselines, advice, owner decisions, outcomes)
// and how they ask for it. Every read and write is logged as an H-MEM event in the run log.
import type { Hmem, MemoryRecord } from "../engines/hmem/index.ts";
import type { Ctx } from "./tools.ts";
import type { ProposedAction, RunState } from "./state.ts";

const AGENT = "H-MEM";

export function recallContext(state: RunState, ctx: Ctx) {
  const r = ctx.hmem.recall({ asOf: state.as_of, entities: [state.outlet_id], text: state.question || "weekly briefing", topN: 5 }, "Planner");
  ctx.emit({ agent_name: AGENT, action: "hmem.recall", input_summary: r.retrievalReason,
    output_summary: r.memories.length ? r.memories.map((m) => `${m.memory.content} [${m.score.toFixed(2)}]`).join("; ") : "no memories yet", target_agent: "Planner" });
  return r.memories.map((m) => m.memory);
}

// Baselines for an outlet's machines, as last learned on or before as_of.
export function recallBaselines(state: RunState, ctx: Ctx, agent: string) {
  const r = ctx.hmem.recall({ asOf: state.as_of, tags: ["baseline"], entities: [state.outlet_id], topN: 100 }, agent);
  const machines = new Map<string, MemoryRecord>(), outlet = r.memories.find((m) => m.memory.tags.includes("outlet"))?.memory;
  for (const { memory } of r.memories) if (memory.tags.includes("machine")) machines.set(memory.data.machine_id, memory);
  ctx.emit({ agent_name: AGENT, action: "hmem.recall", input_summary: r.retrievalReason,
    output_summary: machines.size ? `${machines.size} machine baselines (learned as of ${[...new Set([...machines.values()].map((m) => m.as_of))].join(", ")})` : "no baselines yet",
    target_agent: agent });
  return { machines, outlet };
}

export function writeBaselines(state: RunState, ctx: Ctx, a: any) {
  const asOf = a.baseline_as_of;
  const prev = recallBaselines(state, ctx, "Reporter");
  for (const r of a.readings) {
    const name = a.names[r.machine_id];
    const kwh = r.kwh_baseline;
    ctx.hmem.write({
      content: `${name} normal level: ${kwh ? `${kwh.value.toFixed(2)} kWh per cycle, ` : ""}${r.minutes.baseline.toFixed(0)} min per cycle (${a.baseline_label})`,
      type: "factual", layer: "long_term", as_of: asOf, tags: ["baseline", "machine", r.heat_source], entities: [state.outlet_id, r.machine_id],
      agentId: "Reporter", runId: state.run_id, supersedes: prev.machines.get(r.machine_id)?.id,
      data: { machine_id: r.machine_id, heat_source: r.heat_source, kwh, minutes: r.minutes_baseline, window: a.windows.baseline },
    });
  }
  ctx.hmem.write({
    content: `${state.outlet_id} normal usage: ${a.kwh_per_day.baseline.toFixed(0)} kWh/day, ${a.cycles_per_day.baseline.toFixed(0)} cycles/day (${a.baseline_label})`,
    type: "factual", layer: "long_term", as_of: asOf, tags: ["baseline", "outlet"], entities: [state.outlet_id], agentId: "Reporter", runId: state.run_id,
    supersedes: prev.outlet?.id, data: { kwh_per_day: a.kwh_per_day.baseline, cycles_per_day: a.cycles_per_day.baseline, avg_kwh_per_cycle: a.avg_kwh_per_cycle, window: a.windows.baseline },
  });
  ctx.emit({ agent_name: AGENT, action: "hmem.write", input_summary: `${a.readings.length} machine baselines + outlet baseline`, output_summary: `learned as of ${asOf}`, target_agent: "Planner" });
}

export function rememberAdvice(state: RunState, ctx: Ctx, action: ProposedAction, predicted?: number) {
  ctx.hmem.write({
    content: `Advised: ${action.type} ${action.target}${predicted ? `, predicted saving RM${predicted.toFixed(2)}/month` : ""} (${action.reason})`,
    type: "procedural", layer: "working", as_of: state.as_of, tags: ["advice", action.type], entities: [state.outlet_id, action.target, action.id],
    agentId: "Reporter", runId: state.run_id, data: { action_id: action.id, type: action.type, target: action.target, risk: action.risk, reason: action.reason, predicted_rm_per_month: predicted ?? null },
  });
}

// The owner's past "no" to the same advice, so it is not proposed again (FR-10).
export function priorRejection(state: RunState, ctx: Ctx, type: string, target: string) {
  return ctx.hmem.recall({ asOf: state.as_of, tags: ["decision", "rejected"], entities: [target, type], topN: 1 }, "Reporter").memories[0]?.memory;
}

export function recallApproved(state: RunState, ctx: Ctx, agent: string) {
  const r = ctx.hmem.recall({ asOf: state.as_of, tags: ["decision", "approved"], entities: [state.outlet_id], topN: 20 }, agent);
  const outcomes = ctx.hmem.recall({ asOf: state.as_of, tags: ["outcome"], entities: [state.outlet_id], topN: 50 }, agent).memories.map((m) => m.memory.data.action_id);
  const items = r.memories.map((m) => m.memory).filter((m) => !outcomes.includes(m.data.action_id) || m.data.recheck);
  ctx.emit({ agent_name: AGENT, action: "hmem.recall", input_summary: r.retrievalReason,
    output_summary: items.length ? items.map((m) => m.content).join("; ") : "no approved actions awaiting verification", target_agent: agent });
  return items;
}

// Outcomes recorded in the last `days` days up to as_of (for the weekly briefing).
export function recentOutcomes(state: RunState, ctx: Ctx, days = 7) {
  const since = new Date(Date.parse(state.as_of) - days * 86400000).toISOString().slice(0, 10);
  return ctx.hmem.recall({ asOf: state.as_of, tags: ["outcome"], entities: [state.outlet_id], topN: 20 }, "Reporter").memories.map((m) => m.memory).filter((m) => m.as_of >= since);
}

// Machines with an owner-approved service in memory (verified or not): the service-log fallback skips them.
export function approvedTargets(state: RunState, ctx: Ctx) {
  return new Set(ctx.hmem.all().filter((m) => m.tags.includes("decision") && m.tags.includes("approved") && m.as_of <= state.as_of && m.entities.includes(state.outlet_id)).map((m) => m.data.target));
}

// Advice proposed on or before as_of that the owner has not decided yet.
export function pendingApprovals(state: RunState, ctx: Ctx) {
  const all = ctx.hmem.all();
  return all.filter((m) => m.tags.includes("advice") && m.as_of <= state.as_of && m.entities.includes(state.outlet_id) &&
    !all.some((d) => d.tags.includes("decision") && d.data.action_id === m.data.action_id));
}

// Called by POST /approve and the CLI: records the owner's decision on a proposed action.
export function decideAction(hmem: Hmem, actionId: string, decision: "approved" | "rejected", actor = "Owner") {
  const advice = hmem.all().find((m) => m.tags.includes("advice") && m.data.action_id === actionId);
  if (!advice) throw new Error(`No proposed action ${actionId} in memory`);
  if (hmem.all().some((m) => m.tags.includes("decision") && m.data.action_id === actionId)) throw new Error(`Action ${actionId} was already decided`);
  return hmem.write({
    content: `Owner ${decision} ${advice.data.type} ${advice.data.target}${advice.data.predicted_rm_per_month ? ` (predicted RM${advice.data.predicted_rm_per_month.toFixed(2)}/month)` : ""}`,
    type: "preference", layer: "long_term", as_of: advice.as_of, tags: ["decision", decision, advice.data.type],
    entities: [...advice.entities, advice.data.type], agentId: actor, runId: advice.runId, derivedFrom: [advice.id],
    data: { ...advice.data, decision },
  });
}

export function rememberOutcome(state: RunState, ctx: Ctx, actionId: string, result: Record<string, any>, content: string) {
  ctx.hmem.write({
    content, type: "factual", layer: "long_term", as_of: state.as_of, tags: ["outcome", result.verdict], entities: [state.outlet_id, actionId],
    agentId: "Reporter", runId: state.run_id, data: { action_id: actionId, ...result, recheck: result.verdict === "not_yet" },
  });
  ctx.emit({ agent_name: AGENT, action: "hmem.write", input_summary: `outcome of ${actionId}`, output_summary: content, target_agent: "Planner" });
}
