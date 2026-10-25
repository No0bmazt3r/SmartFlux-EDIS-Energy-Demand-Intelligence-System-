// pnpm examples: runs input_examples/01–08 in date order on a fresh memory (the owner approves the service proposed
// in 02 before 07 checks it) and saves the real outputs to output_examples/. Logs go to logs/ as usual.
// Each run's JSONL log is copied to output_examples/logs/. Nothing in the app reads output_examples/.
// The sequence itself lives in apps/backend/src/demo-history.ts, shared with the `pnpm demo` history.
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../apps/backend/src/config.ts";
import { runExampleSequence } from "../apps/backend/src/demo-history.ts";

const cfg = { ...loadConfig(), hmemDir: mkdtempSync(join(tmpdir(), "sf-examples-")) };
mkdirSync("output_examples/logs", { recursive: true });
await runExampleSequence(cfg, "input_examples", ({ name, result: res, approved }) => {
  const log = `output_examples/logs/${name}.jsonl`; // a committed copy: logs/ itself is gitignored
  copyFileSync(res.log, log);
  writeFileSync(join("output_examples", `${name}.json`), JSON.stringify({ ...res, log }, null, 2) + "\n");
  console.log(`${name}.json: ${res.decisions.map((d) => d.verdict).join(" | ") || res.message?.split("\n")[0]}`);
  if (approved) console.log(`  owner approves ${approved.id}: ${approved.content}`);
});
