import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "../config.ts";
import { run } from "./run.ts";

const cfg = { ...loadConfig({ SAMPLE_MODE: "true" }), logDir: mkdtempSync(join(tmpdir(), "sf-logs-")) };
const REQUIRED = ["ts", "run_id", "agent_name", "action", "input_summary", "output_summary", "retry_count", "status", "mode"];

test("tariff run: approved by the Skeptic, logged with every required field", async () => {
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" }, cfg, { echo: false });
  assert.equal(res.decisions.length, 1);
  const events = readFileSync(res.log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  for (const e of events) for (const f of REQUIRED) assert.ok(f in e, `${e.action} lacks ${f}`);
  assert.ok(events.some((e) => e.agent_name === "Skeptic" && e.action === "approve"));
  assert.ok(events.some((e) => e.agent_name === "Skeptic" && e.action === "sqlite.query"), "Skeptic runs its own verification query");
  assert.equal(res.actions[0]?.status ?? "awaiting_approval", "awaiting_approval", "a tariff switch never auto-executes");
});

test("as_of hides later data, so an earlier as_of gives a different answer", async () => {
  const early = await run({ outlet_id: "OUT-01", as_of: "2026-09-13", question: "Should I switch to the ToU tariff?" }, cfg, { echo: false });
  const late = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Should I switch to the ToU tariff?" }, cfg, { echo: false });
  assert.equal(early.decisions[0].confidence, "low");
  assert.notDeepEqual(early.decisions[0].evidence, late.decisions[0].evidence);
});

test("out-of-scope requests are refused with what it can do", async () => {
  const res = await run({ outlet_id: "OUT-01", as_of: "2026-10-18", question: "Write me a marketing email" }, cfg, { echo: false });
  assert.equal(res.decisions.length, 0);
  assert.match(res.message ?? "", /can help with/);
});
