import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "./config.ts";
import { isFresh, seedDemoHistory } from "./demo-history.ts";

const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "sf-demo-"));
  return { ...loadConfig({ SAMPLE_MODE: "true", LLM_MODE: "replay" }), logDir: join(dir, "logs"), hmemDir: join(dir, "hmem") };
};

test("a fresh demo gets the example history once, and the recorded Nemotron answers still match the prompts", async () => {
  const cfg = fresh();
  assert.equal(await seedDemoHistory(cfg, () => {}), true);
  const runs = readdirSync(cfg.logDir).filter((f) => f.endsWith(".result.json"));
  assert.equal(runs.length, 8);
  const logs = readdirSync(cfg.logDir).filter((f) => /^r-.*\.jsonl$/.test(f)).map((f) => join(cfg.logDir, f));
  const text = logs.map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok(text.includes("(replayed)"), "the recorded Nemotron answers were used");
  assert.ok(!text.includes('"status":"fallback"'),
    "a prompt changed since the Nemotron run was recorded: re-record with LLM_MODE=nvidia LLM_RECORD=true pnpm examples (see README)");
  assert.equal(isFresh(cfg), false);
  assert.equal(await seedDemoHistory(cfg, () => {}), false, "a demo that has history is left alone");
});
