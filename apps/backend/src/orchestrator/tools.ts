// The tools agents call. Each call counts toward the cap, is logged, and is kept as evidence.
import type { SampleDb } from "../adapters/local-sqlite.ts";
import type { Hmem } from "../engines/hmem/index.ts";
import type { Emit } from "../log.ts";
import { querySqlite } from "../templates/index.ts";
import type { RunState } from "./state.ts";

export type Ctx = { db: SampleDb; emit: Emit; hmem: Hmem };

export function query(state: RunState, ctx: Ctx, agent: string, name: string, params: Record<string, string | number>, target = agent) {
  state.counters.tool_calls++;
  const t0 = performance.now();
  const rows = querySqlite(ctx.db, name, params, state.as_of);
  const id = `e${state.evidence.length + 1}`;
  const summary = `${rows.length} rows`;
  state.evidence.push({ id, kind: "query", name, params, summary, output: rows });
  ctx.emit({
    agent_name: agent, action: state.mode.data === "zetaris" ? "zetaris.query" : "sqlite.query",
    input_summary: `template=${name} ${Object.values(params).join(" ")} as_of=${state.as_of}`,
    output_summary: summary, target_agent: target, ms: Math.round(performance.now() - t0),
  });
  return { rows, id };
}

export function calc<T>(state: RunState, ctx: Ctx, agent: string, name: string, inputSummary: string, fn: () => T, summarize: (out: T) => string, target = agent) {
  state.counters.tool_calls++;
  const out = fn();
  const id = `e${state.evidence.length + 1}`;
  const summary = summarize(out);
  state.evidence.push({ id, kind: "calc", name, params: { input: inputSummary }, summary, output: out });
  ctx.emit({ agent_name: agent, action: `calc.${name}`, input_summary: inputSummary, output_summary: summary, target_agent: target });
  return { out, id };
}
