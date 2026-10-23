// pnpm examples: runs input_examples/01–08 in order on a fresh memory (the owner approves the service proposed
// in 02 before 07 checks it) and saves the real outputs to output_examples/. Logs go to logs/ as usual.
// Each run's JSONL log is copied to output_examples/logs/. Nothing in the app reads output_examples/.
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { loadConfig } from "../apps/backend/src/config.ts";
import { openHmem } from "../apps/backend/src/engines/hmem/index.ts";
import { decideAction } from "../apps/backend/src/orchestrator/memory.ts";
import { run } from "../apps/backend/src/orchestrator/run.ts";
import { validateRequest } from "../apps/backend/src/orchestrator/state.ts";

const cfg = { ...loadConfig(), hmemDir: mkdtempSync(join(tmpdir(), "sf-examples-")) };
mkdirSync("output_examples/logs", { recursive: true });
for (const f of readdirSync("input_examples").filter((x) => x.endsWith(".json")).sort()) {
  const res = await run(validateRequest(JSON.parse(readFileSync(join("input_examples", f), "utf8"))), cfg, { echo: false });
  const log = `output_examples/logs/${basename(f, ".json")}.jsonl`; // a committed copy: logs/ itself is gitignored
  copyFileSync(res.log, log);
  writeFileSync(join("output_examples", f), JSON.stringify({ ...res, log }, null, 2) + "\n");
  console.log(`${f}: ${res.decisions.map((d) => d.verdict).join(" | ") || res.message?.split("\n")[0]}`);
  if (f.startsWith("02")) {
    const service = res.actions.find((a) => a.type === "schedule_service");
    if (service) console.log(`  owner approves ${service.id}: ${decideAction(openHmem(cfg.hmemDir, cfg.logDir), service.id, "approved").content}`);
  }
}
