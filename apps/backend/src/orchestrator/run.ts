// The state machine: Scout → Planner ↔ Investigator ↔ Skeptic → Reporter, with caps (implementation §5.1).
// Live mode: data through Zetaris, reasoning through Nemotron on Nightshift. Any live step that fails falls
// back to its local twin (SQLite, rules) and the run is marked "mixed" from that event on.
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openSampleDb } from "../adapters/local-sqlite.ts";
import { createLlm } from "../adapters/llm-providers.ts";
import { createZetaris } from "../adapters/zetaris.ts";
import { llmReporter, llmScout } from "../agents/llm/index.ts";
import { investigator } from "../agents/rules/investigator.ts";
import { planner } from "../agents/rules/planner.ts";
import { reporter } from "../agents/rules/reporter.ts";
import { skeptic } from "../agents/rules/skeptic.ts";
import type { Config } from "../config.ts";
import { openHmem } from "../engines/hmem/index.ts";
import { classify, groundIntents } from "../engines/scout/index.ts";
import { createLogger } from "../log.ts";
import { capsHit } from "./caps.ts";
import { recallContext } from "./memory.ts";
import type { RunRequest, RunResult, RunState } from "./state.ts";
import { tryLlm, type Ctx } from "./tools.ts";

// Keeps scalars and small nested objects (two levels), drops arrays: enough to audit a finding's numbers.
const compact = (o: Record<string, any>, depth = 0): Record<string, unknown> => Object.fromEntries(Object.entries(o)
  .filter(([, v]) => !Array.isArray(v) && v !== undefined)
  .map(([k, v]) => [k, v && typeof v === "object" ? (depth < 2 ? compact(v, depth + 1) : undefined) : v]).filter(([, v]) => v !== undefined));

export async function run(req: RunRequest, cfg: Config, opts: { echo?: boolean } = {}): Promise<RunResult & { message?: string }> {
  const runId = `r-${randomUUID().slice(0, 8)}`;
  const live = cfg.mode.data === "zetaris" || cfg.mode.llm === "nightshift" || cfg.mode.llm === "nvidia";
  const degraded = new Set<string>();
  const { emit, path } = createLogger(runId, () => (!live ? "sample" : degraded.size ? "mixed" : "live"), cfg.logDir, opts.echo ?? true);
  const ctx: Ctx = {
    db: openSampleDb(cfg.dataDir), emit, hmem: openHmem(cfg.hmemDir, cfg.logDir), degraded,
    zetaris: cfg.zetaris && createZetaris(cfg.zetaris), llm: createLlm(cfg),
  };

  const question = req.question ?? "";
  // A weekly briefing has no question: the agent checks advice awaiting verification, machine health and the tariff.
  let scout: { intents: RunState["intents"]; lang: RunState["lang"]; model?: string; ms?: number } | undefined =
    req.briefing && !question ? { intents: ["advice_followup", "machine_health", "tariff_decision"], lang: req.lang ?? "en" } : undefined;
  if (!scout && ctx.llm) {
    scout = await tryLlm(ctx, "Scout", "classify", () => llmScout(ctx.llm!, question));
    if (scout && req.lang) scout.lang = req.lang;
    if (scout) {
      const g = groundIntents(question, scout.intents);
      if (g.dropped.length || g.intents.length !== scout.intents.length) emit({
        agent_name: "Scout", action: "ground_intents", input_summary: `model proposed [${scout.intents.join(",")}]`,
        output_summary: `kept [${g.intents.join(",")}]${g.dropped.length ? `; dropped [${g.dropped.join(",")}]: not mentioned in the question` : ""}`,
        target_agent: "Scout", status: g.dropped.length ? "needs_revision" : "success", model: scout.model,
      });
      scout.intents = g.intents;
    }
  }
  scout ??= classify(question, req.lang);
  const state: RunState = {
    run_id: runId, as_of: req.as_of, outlet_id: req.outlet_id, question, lang: scout.lang,
    intents: scout.intents, risk: "read_only", refused: scout.intents.includes("out_of_scope"), briefing: !!req.briefing,
    hypotheses: [], evidence: [], claims: [], actions: [], decisions: [], unresolved: [], memory: [],
    counters: { tool_calls: 0, replans: 0, rejections: {} }, caps: cfg.caps, mode: cfg.mode, needsReplan: false,
  };
  emit({
    agent_name: "Scout", action: "classify", input_summary: question || "(weekly briefing, no question)",
    output_summary: `intents=[${state.intents.join(",")}] risk=${state.risk} lang=${state.lang}`,
    target_agent: state.refused ? "Reporter" : "Planner", model: scout.model, ms: scout.ms,
  });

  if (!state.refused) {
    state.memory = recallContext(state, ctx).map((m) => `${m.content} (as of ${m.as_of})`);
    for (; state.counters.replans <= cfg.caps.replans; state.counters.replans++) {
      await planner(state, ctx);
      while (!capsHit(state)) {
        await investigator(state, ctx);
        if ((await skeptic(state, ctx)) === "approved") break;
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
  if (ctx.llm && state.decisions.length) {
    const r = await tryLlm(ctx, "Reporter", "word", () => llmReporter(ctx.llm!, state.decisions, state.lang));
    if (r) {
      state.decisions = r.decisions;
      emit({ agent_name: "Reporter", action: "word", input_summary: `${r.decisions.length} cards, lang=${state.lang}`,
        output_summary: r.rejected ? `${r.rejected} rewrites kept the template text (a number changed)` : "cards reworded; every number unchanged", model: r.model, ms: r.ms });
    }
  }

  const reasoning = { nightshift: "Nemotron via Nightshift", nvidia: "Nemotron via build.nvidia.com", replay: "recorded Nemotron answers", rules: "rules" }[cfg.mode.llm];
  const modeLabel = !live ? (cfg.mode.llm === "replay" ? `sample (data: local sample; reasoning: ${reasoning}${degraded.has("llm") ? ", rules twin on replay misses" : ""})` : "sample (rules reasoner, no LLM)")
    : `${degraded.size ? "mixed" : "live"} (data: ${cfg.mode.data === "zetaris" && !degraded.has("data") ? "Zetaris" : cfg.mode.data === "zetaris" ? "Zetaris with local fallback" : "local sample"}; ` +
      `reasoning: ${cfg.mode.llm === "rules" ? "rules" : degraded.has("llm") ? `${reasoning} with rules fallback` : reasoning})`;
  const result = {
    run_id: runId, mode: modeLabel, outlet_id: state.outlet_id, as_of: state.as_of,
    decisions: state.decisions, actions: state.actions, unresolved: state.unresolved, log: path,
    ...(message ? { message } : {}),
  };
  // Saved next to the log so GET /runs/:id and the Admin run log read the same record (never by the agent).
  writeFileSync(join(cfg.logDir, `${runId}.result.json`), JSON.stringify({
    ...result, question, intents: state.intents, briefing: state.briefing, created_at: new Date().toISOString(),
    tool_calls: state.counters.tool_calls, run_mode: !live ? "sample" : degraded.size ? "mixed" : "live",
    // Approved findings, scalars only (for eval/ and audit); weeks/rows arrays are left out to keep it small.
    findings: state.claims.filter((c) => c.status === "approved").map((c) => ({ kind: c.kind, text: c.text, data: compact(c.data) })),
    ruled_out: state.hypotheses.filter((h) => h.status === "rejected").map((h) => ({ kind: h.kind, reason: h.reason })),
  }, null, 1));
  return result;
}
