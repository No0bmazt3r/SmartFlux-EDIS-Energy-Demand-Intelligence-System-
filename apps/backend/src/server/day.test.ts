import assert from "node:assert/strict";
import test from "node:test";
import { openSampleDb } from "../adapters/local-sqlite.ts";
import { loadConfig } from "../config.ts";
import { dayLoad } from "./outlet.ts";

const cfg = loadConfig({ SAMPLE_MODE: "true" });
const db = openSampleDb(cfg.dataDir);

test("daily load: as_of on a Sunday shows the latest working day, 48 half-hours, the peak window from the meter rule", async () => {
  const d = await dayLoad(cfg, db, "OUT-01", "2026-10-18");
  assert.equal(d.date, "2026-10-16"); // Fri; 17–18 Oct are the weekend
  assert.equal(d.slots.length, 48);
  const peak = d.slots.filter((s) => s.peak).map((s) => s.t);
  assert.deepEqual([peak[0], peak.at(-1), peak.length], ["14:00", "21:30", 16]);
  const s = d.summary!;
  assert.ok(Math.abs(s.peak_kwh / s.kwh - s.peak_share) < 1e-9);
  assert.ok(d.typical_days >= 15 && d.slots.every((x) => x.typical != null), "typical line from the working days before");
});

test("daily load: a weekend day has no peak window, and nothing after as_of is read", async () => {
  const d = await dayLoad(cfg, db, "OUT-01", "2026-10-18", "2026-10-17");
  assert.equal(d.working_day, false);
  assert.equal(d.summary!.peak_kwh, 0);
  const early = await dayLoad(cfg, db, "OUT-01", "2026-10-04");
  assert.ok(early.dates.every((x) => x <= "2026-10-04"));
});
