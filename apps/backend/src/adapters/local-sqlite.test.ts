import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openSampleDb } from "./local-sqlite.ts";

test("CSVs with Windows line endings still load numbers as numbers", () => {
  // git on Windows usually checks text files out with CRLF, which used to turn every table's last column
  // (cycle prices, meter kWh, solar derate) into text, and crashed the customer machine tiles.
  const dir = mkdtempSync(join(tmpdir(), "sf-crlf-"));
  for (const f of readdirSync("data/sample").filter((x) => x.endsWith(".csv")))
    writeFileSync(join(dir, f), readFileSync(join("data/sample", f), "utf8").replace(/\r?\n/g, "\r\n"));
  const db = openSampleDb(dir);
  assert.deepEqual({ ...db.prepare("SELECT typeof(MIN(price_rm)) t FROM machine_cycles").get() }, { t: "real" });
  assert.deepEqual({ ...db.prepare("SELECT typeof(kwh) t FROM meter_readings LIMIT 1").get() }, { t: "real" });
});
