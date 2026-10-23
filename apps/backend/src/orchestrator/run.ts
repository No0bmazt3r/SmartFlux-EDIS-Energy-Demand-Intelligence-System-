// The state machine: Scout → Planner ↔ Investigator ↔ Skeptic → Reporter, with caps (implementation §5.1).
import { randomUUID } from "node:crypto";
import { openSampleDb } from "../adapters/local-sqlite.ts";
import { investigator } from "../agents/rules/investigator.ts";
import { planner } from "../agents/rules/planner.ts";
import { reporter } from "../agents/rules/reporter.ts";
import { skeptic } from "../agents/rules/skeptic.ts";
import type { Config } from "../config.ts";
import { classify } from "../engines/scout/index.ts";
import { createLogger } from "../log.ts";
import { capsHit } from "./caps.ts";
import type { RunRequest, RunResult, RunState } from "./state.ts";

export async function run(req: RunRequest, cfg: Config, opts: { echo?: boolean } = {}): Promise<RunResult & { message?: string }> {
  if (cfg.mode.data !== "local") throw new Error("Live mode is not built yet. Run with SAMPLE_MODE=true.");
  const runId = `r-${randomUUID().slice(0, 8)}`;
  const mode = "sample";
  const { emit, path } = createLogger(runId, mode, cfg.logDir, opts.echo ?? true);
  const ctx = { db: openSampleDb(cfg.dataDir), emit };

  const question = req.question ?? "";
  const scout = classify(question, req.lang);
  const state: RunState = {
    run_id: runId, as_of: req.as_of, outlet_id: req.outlet_id, question, lang: scout.lang,
    intents: scout.intents, risk: scout.risk, refused: scout.intents.includes("out_of_scope"),
    hypotheses: [], evidence: [], claims: [], actions: [], decisions: [], unresolved: [],
    counters: { tool_calls: 0, replans: 0, rejections: {} }, caps: cfg.caps, mode: cfg.mode, needsReplan: false,
  };
  emit({
    agent_name: "Scout", action: "classify", input_summary: question,
    output_summary: `intents=[${state.intents.join(",")}] risk=${state.risk} lang=${state.lang}`,
    target_agent: state.refused ? "Reporter" : "Planner",
  });

  if (!state.refused) {
    for (; state.counters.replans <= cfg.caps.replans; state.counters.replans++) {
      planner(state, ctx);
      while (!capsHit(state)) {
        investigator(state, ctx);
        if (skeptic(state, ctx) === "approved") break;
      }
      if (!state.needsReplan) break;
    }
    const cap = capsHit(state);
    for (const h of state.hypotheses.filter((h) => h.status === "open")) {
      h.status = "unresolved";
      state.unresolved.push(`${h.text}: ${cap ?? "not verified"}`);
    }
  }
  const message = reporter(state, ctx);

  return {
    run_id: runId, mode: "sample (rules reasoner, no LLM)", outlet_id: state.outlet_id, as_of: state.as_of,
    decisions: state.decisions, actions: state.actions, unresolved: state.unresolved, log: path,
    ...(message ? { message } : {}),
  };
}
