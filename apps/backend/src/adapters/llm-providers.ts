// Picks the LLM generator for a run, and adds record-and-replay around it.
//   nightshift: Nemotron through Meterless Nightshift (primary live path)
//   nvidia:     Nemotron straight from build.nvidia.com (backup live path, same OpenAI format)
//   replay:     answers recorded from a real live run, so a clean clone exercises the LLM agents offline
//   rules:      no LLM (the rules twins only)
// With LLM_RECORD=true, every live answer is saved to the cache directory, one JSON file per prompt.
// A replay miss throws, and tryLlm falls back to the rules twin for that step, exactly as in live mode.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.ts";
import { createNightshift, LlmError, type GenerateOpts, type Generator } from "./llm.ts";

// Same request → same key. The lane, system prompt, prompt, JSON flag and token limit all change the answer.
// Run ids (r-1a2b3c4d, and action ids built from them) are random per run and reach prompts through memory
// ("Outcome of r-1a2b3c4d-a1: …"), so they are masked; otherwise a replay could never match its recording.
const RUN_ID = /\br-[0-9a-f]{8}\b/g;
export function cacheKey(prompt: string, o: GenerateOpts): string {
  return createHash("sha256")
    .update(JSON.stringify([o.lane, o.system ?? "", prompt.replace(RUN_ID, "r-*"), !!o.json, o.maxTokens ?? 800]))
    .digest("hex").slice(0, 20);
}

type Recording = { key: string; provider: string; lane: string; model: string; system?: string; prompt: string; text: string; ms: number; recorded_at: string };

export function withRecording(gen: Generator, dir: string, provider: string): Generator {
  mkdirSync(dir, { recursive: true });
  return async (prompt, opts) => {
    const g = await gen(prompt, opts);
    const key = cacheKey(prompt, opts);
    const rec: Recording = { key, provider, lane: opts.lane, model: g.model, system: opts.system, prompt, text: g.text, ms: g.ms, recorded_at: new Date().toISOString() };
    writeFileSync(join(dir, `${key}.json`), JSON.stringify(rec, null, 2) + "\n");
    return g;
  };
}

export function createReplay(dir: string): Generator {
  return async (prompt, opts) => {
    const file = join(dir, `${cacheKey(prompt, opts)}.json`);
    if (!existsSync(file)) throw new LlmError(`no recorded answer for this ${opts.lane} prompt (replay miss)`);
    const rec = JSON.parse(readFileSync(file, "utf8")) as Recording;
    // The model name is kept so logs stay honest about which model wrote the answer, and marked as replayed.
    return { text: rec.text, model: `${rec.model} (replayed)`, ms: 0, retries: 0 };
  };
}

export function createLlm(cfg: Config): Generator | undefined {
  if (cfg.mode.llm === "replay") return createReplay(cfg.llmCacheDir);
  if (!cfg.llm) return undefined;
  const gen = createNightshift(cfg.llm);
  return cfg.llmRecord ? withRecording(gen, cfg.llmCacheDir, cfg.mode.llm) : gen;
}
