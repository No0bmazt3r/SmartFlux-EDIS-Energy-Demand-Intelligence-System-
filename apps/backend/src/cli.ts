// pnpm agent --input input_examples/01-tou-switch.json   (prints every log event as JSONL, then the result JSON)
// pnpm agent --approve <action_id> | --reject <action_id>  (records the owner's decision in H-MEM)
// pnpm agent --briefing --as-of 2026-10-18 [--outlet OUT-01]  (the weekly briefing for every outlet, on demand)
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.ts";
import { openHmem } from "./engines/hmem/index.ts";
import { decideAction } from "./orchestrator/memory.ts";
import { run } from "./orchestrator/run.ts";
import { runBriefings } from "./scheduler.ts";
import { validateRequest } from "./orchestrator/state.ts";

const { values } = parseArgs({ options: { input: { type: "string" }, quiet: { type: "boolean", default: false }, approve: { type: "string" }, reject: { type: "string" }, briefing: { type: "boolean" }, "as-of": { type: "string" }, outlet: { type: "string" } } });

try {
  const decide = values.approve ?? values.reject;
  if (decide) {
    const cfg = loadConfig();
    const m = decideAction(openHmem(cfg.hmemDir, cfg.logDir), decide, values.approve ? "approved" : "rejected");
    console.log(m.content);
    process.exit(0);
  }
  if (values.briefing) {
    if (!values["as-of"]) throw new Error("Usage: pnpm agent --briefing --as-of YYYY-MM-DD [--outlet OUT-01]");
    const cfg = loadConfig();
    for (const r of await runBriefings(cfg, values["as-of"], values.outlet ? [values.outlet] : undefined))
      console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  }
  if (!values.input) throw new Error("Usage: pnpm agent --input <request.json> | --approve <action_id> | --reject <action_id>");
  const req = validateRequest(JSON.parse(readFileSync(values.input, "utf8")));
  const result = await run(req, loadConfig(), { echo: !values.quiet });
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(`Error: ${(e as Error).message}`);
  process.exitCode = 1;
}
