// The example sequence: input_examples/01–08 in date order, with the owner approving the dryer service proposed in 02
// so that 07 can verify it. `pnpm examples` runs it to regenerate the committed examples; `pnpm demo` runs it once on an
// empty memory so the dashboard opens with a history (a flagged dryer, an approval, a verified saving, a run log)
// instead of empty panels. Same requests in the same order on an empty memory, so a replay matches its recording.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Config } from "./config.ts";
import { openHmem } from "./engines/hmem/index.ts";
import { decideAction } from "./orchestrator/memory.ts";
import { run } from "./orchestrator/run.ts";
import { validateRequest } from "./orchestrator/state.ts";

export type ExampleRun = { name: string; result: Awaited<ReturnType<typeof run>>; approved?: { id: string; content: string } };

export async function runExampleSequence(cfg: Config, dir = "input_examples", onRun?: (r: ExampleRun) => void) {
  const out: ExampleRun[] = [];
  // In date order (as_of, then file name), like a real history: advice from 4 Oct is in memory before the 18 Oct
  // sessions, so an 18 Oct question points at the advice still awaiting a decision instead of queuing a copy.
  const files = readdirSync(dir).filter((x) => x.endsWith(".json"))
    .map((f) => ({ f, req: validateRequest(JSON.parse(readFileSync(join(dir, f), "utf8"))) }))
    .sort((a, b) => a.req.as_of.localeCompare(b.req.as_of) || a.f.localeCompare(b.f));
  for (const { f, req } of files) {
    const result = await run(req, cfg, { echo: false });
    const r: ExampleRun = { name: basename(f, ".json"), result };
    if (f.startsWith("02")) {
      const service = result.actions.find((a) => a.type === "schedule_service");
      if (service) r.approved = { id: service.id, content: decideAction(openHmem(cfg.hmemDir, cfg.logDir), service.id, "approved").content };
    }
    out.push(r);
    onRun?.(r);
  }
  return out;
}

// Only on a fresh install: no stored runs and no memory yet. A demo someone has already used is left alone.
export function isFresh(cfg: Config) {
  const runs = existsSync(cfg.logDir) && readdirSync(cfg.logDir).some((f) => f.endsWith(".result.json"));
  const memory = existsSync(cfg.hmemDir) && readdirSync(cfg.hmemDir).length > 0;
  return !runs && !memory;
}

export async function seedDemoHistory(cfg: Config, log: (s: string) => void = console.log) {
  if (cfg.mode.data !== "local" || !isFresh(cfg) || !existsSync("input_examples")) return false;
  log("Demo history: running the 8 example sessions once (13 Sep → 4 Oct → 18 Oct), so the dashboard isn't empty…");
  const runs = await runExampleSequence(cfg);
  const fallbacks = runs.reduce((n, r) => n + readFileSync(r.result.log, "utf8").split("\n").filter((l) => l.includes('"status":"fallback"')).length, 0);
  log(`Demo history: ${runs.length} runs stored (reasoning: ${cfg.mode.llm}${fallbacks ? `, ${fallbacks} steps used the rules agents` : ""}). Reset with: rm -rf data/hmem logs`);
  return true;
}
