import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { faultCheck } from "../../calc/fault.ts";
import { openHmem } from "./index.ts";

const dirs = () => { const d = mkdtempSync(join(tmpdir(), "hmem-")); return [join(d, "store"), join(d, "logs")] as const; };
const baseline = (value: number) => ({
  content: `OUT-01-D4 baseline ${value} kWh per cycle`, type: "factual" as const, layer: "long_term" as const, as_of: "2026-09-13",
  tags: ["baseline", "kwh_per_cycle"], entities: ["OUT-01", "OUT-01-D4"], agentId: "Reporter", runId: "r-1",
  data: { machine_id: "OUT-01-D4", value, se: 0.05, cycles: 40 },
});

test("a baseline survives a restart, is recalled, and flags a +33% reading", () => {
  const [store, logs] = dirs();
  openHmem(store, logs).write(baseline(2.1));
  const restarted = openHmem(store, logs); // new process: warm start from disk
  const hit = restarted.recall({ asOf: "2026-10-04", tags: ["baseline"], entities: ["OUT-01-D4"] }, "Investigator").memories[0];
  assert.equal(hit.memory.data.value, 2.1);
  const [d4] = faultCheck([
    { machine_id: "OUT-01-D4", type: "dryer", heat_source: "electric", baseline: hit.memory.data as any, current: { value: 2.8, se: 0.05, cycles: 40 } },
    { machine_id: "OUT-01-D1", type: "dryer", heat_source: "electric", baseline: { value: 2.0, se: 0.05, cycles: 40 }, current: { value: 2.02, se: 0.05, cycles: 40 } },
  ], { days: 14, rateRmPerKwh: 0.5068, lpgRmPerMinute: 0.05 });
  assert.equal(d4.flagged, true);
  assert.ok(Math.abs(d4.delta_pct - 33.33) < 0.01);
});

test("memories are invisible before the as_of they were learned at", () => {
  const [store, logs] = dirs();
  const h = openHmem(store, logs);
  h.write(baseline(2.1));
  assert.equal(h.recall({ asOf: "2026-09-10", tags: ["baseline"] }, "test").memories.length, 0);
  assert.equal(h.recall({ asOf: "2026-09-13", tags: ["baseline"] }, "test").memories.length, 1);
});

test("a newer baseline supersedes the old one from its as_of on; rejected advice is remembered", () => {
  const [store, logs] = dirs();
  const h = openHmem(store, logs);
  const old = h.write(baseline(2.1));
  h.write({ ...baseline(2.15), as_of: "2026-10-18", supersedes: old.id });
  assert.equal(h.recall({ asOf: "2026-10-04", tags: ["baseline"] }, "t").memories[0].memory.data.value, 2.1);
  assert.equal(h.recall({ asOf: "2026-10-18", tags: ["baseline"] }, "t").memories[0].memory.data.value, 2.15);

  h.write({ content: "Owner rejected switch_tariff for OUT-01", type: "preference", layer: "long_term", as_of: "2026-10-04",
    tags: ["decision", "rejected"], entities: ["OUT-01", "switch_tariff"], agentId: "Owner", runId: "r-2", data: { action_type: "switch_tariff", target: "OUT-01" } });
  const again = openHmem(store, logs).recall({ asOf: "2026-10-18", tags: ["decision", "rejected"], entities: ["switch_tariff"] }, "Reporter");
  assert.equal(again.memories.length, 1, "rejection survives a restart, so the advice is not re-proposed");
});

test("feedback moves confidence, and every mutation lands in the JSONL ledger", () => {
  const [store, logs] = dirs();
  const h = openHmem(store, logs);
  const m = h.write(baseline(2.1));
  h.feedback(m.id, "wrong", "Skeptic");
  assert.ok(h.all()[0].confidence < 0.8);
  assert.ok(h.all()[0].tags.includes("review"));
  const actions = readFileSync(h.ledgerPath, "utf8").trim().split("\n").map((l) => JSON.parse(l).action);
  assert.deepEqual(actions, ["create", "feedback"]);
});
