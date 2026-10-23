// pnpm agent --input input_examples/01-tou-switch.json
// Prints every log event as JSONL, then the result JSON.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.ts";
import { run } from "./orchestrator/run.ts";
import { validateRequest } from "./orchestrator/state.ts";

const { values } = parseArgs({ options: { input: { type: "string" }, quiet: { type: "boolean", default: false } } });

try {
  if (!values.input) throw new Error("Usage: pnpm agent --input <request.json>");
  const req = validateRequest(JSON.parse(readFileSync(values.input, "utf8")));
  const result = await run(req, loadConfig(), { echo: !values.quiet });
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(`Error: ${(e as Error).message}`);
  process.exitCode = 1;
}
