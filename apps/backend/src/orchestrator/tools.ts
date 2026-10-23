// The tools agents call. Each call counts toward the cap, is logged, and is kept as evidence.
// Live data goes through Zetaris; a failed Zetaris query is retried once, then the same template runs on
// local SQLite and the run is marked mixed (proposal §13.3).
import type { SampleDb } from "../adapters/local-sqlite.ts";
import type { Zetaris } from "../adapters/zetaris.ts";
import type { Generator } from "../adapters/llm.ts";
import type { Hmem } from "../engines/hmem/index.ts";
import type { Emit } from "../log.ts";
import { checkCap, prepare, querySqlite } from "../templates/index.ts";
import type { RunState } from "./state.ts";

export type Ctx = { db: SampleDb; emit: Emit; hmem: Hmem; zetaris?: Zetaris; llm?: Generator; degraded: Set<string> };

export async function query(state: RunState, ctx: Ctx, agent: string, name: string, params: Record<string, string | number>, target = agent) {
  state.counters.tool_calls++;
  const t0 = performance.now();
  const input = `template=${name} ${Object.values(params).join(" ")} as_of=${state.as_of}`;
  let rows: Record<string, any>[] | undefined, retries = 0, source = "sqlite";
  if (state.mode.data === "zetaris" && ctx.zetaris) {
    const { t, bound, cap } = prepare(name, params, state.as_of);
    for (; retries <= 1 && !rows; retries++) {
      try {
        rows = checkCap(name, await ctx.zetaris.query(t.lightning, bound, cap + 1), cap);
        source = "zetaris";
      } catch (e) {
        ctx.emit({ agent_name: agent, action: "zetaris.query", input_summary: input, output_summary: (e as Error).message.slice(0, 200),
          target_agent: agent, retry_count: retries, status: retries === 0 ? "retrying" : "fallback" });
        if (retries === 1) ctx.degraded.add("data");
      }
    }
    retries = Math.max(0, retries - 1);
  }
  rows ??= querySqlite(ctx.db, name, params, state.as_of);
  const id = `e${state.evidence.length + 1}`;
  const summary = `${rows.length} rows`;
  state.evidence.push({ id, kind: "query", name, params, summary, output: rows });
  ctx.emit({
    agent_name: agent, action: `${source}.query`, input_summary: input, output_summary: summary, target_agent: target,
    retry_count: retries, status: source === "sqlite" && state.mode.data === "zetaris" ? "fallback" : "success", ms: Math.round(performance.now() - t0),
  });
  return { rows, id };
}

// Runs one Nemotron step; on failure logs a fallback event, marks the run mixed, and returns undefined so the
// caller uses its rules twin.
export async function tryLlm<T>(ctx: Ctx, agent: string, action: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    ctx.degraded.add("llm");
    ctx.emit({ agent_name: agent, action: `llm.${action}`, input_summary: "Nightshift call", output_summary: `fell back to the rules twin: ${(e as Error).message.slice(0, 200)}`, status: "fallback" });
    return undefined;
  }
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
