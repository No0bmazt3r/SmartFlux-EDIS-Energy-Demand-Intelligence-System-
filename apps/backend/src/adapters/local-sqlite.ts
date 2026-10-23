// Sample mode and fallback data path: the cached CSVs in an in-memory node:sqlite database,
// with the same table and view names as the Zetaris USL model so every template has a SQLite twin.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const NUMERIC = /^-?\d+(\.\d+)?$/;

export function openSampleDb(dir: string) {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".csv"))) {
    const [head, ...lines] = readFileSync(join(dir, file), "utf8").trim().split("\n");
    if (!lines.length) continue;
    const cols = head.split(",");
    const first = lines[0].split(",");
    const types = cols.map((_, i) => (NUMERIC.test(first[i]) ? "REAL" : "TEXT"));
    const table = basename(file, ".csv");
    db.exec(`CREATE TABLE ${table} (${cols.map((c, i) => `${c} ${types[i]}`).join(", ")})`);
    const insert = db.prepare(`INSERT INTO ${table} VALUES (${cols.map(() => "?").join(", ")})`);
    db.exec("BEGIN");
    for (const line of lines) insert.run(...line.split(",").map((v, i) => (types[i] === "REAL" ? Number(v) : v)));
    db.exec("COMMIT");
  }
  // USL views. Peak = Mon–Fri 14:00–22:00 except public holidays (TNB ToU, July 2025). Week 1 starts Mon 7 Sep 2026.
  db.exec(`
    CREATE VIEW interval_usage AS
    SELECT m.outlet_id, m.interval_start,
           CAST((julianday(date(m.interval_start)) - julianday('2026-09-07')) / 7 AS INTEGER) + 1 AS week,
           m.kwh,
           CASE WHEN h.date IS NULL
                 AND CAST(strftime('%w', m.interval_start) AS INTEGER) BETWEEN 1 AND 5
                 AND CAST(strftime('%H', m.interval_start) AS INTEGER) BETWEEN 14 AND 21
                THEN 'peak' ELSE 'offpeak' END AS period,
           CASE WHEN h.date IS NULL THEN 0 ELSE 1 END AS is_holiday
    FROM meter_readings m LEFT JOIN holidays h ON h.date = date(m.interval_start);
  `);
  return db;
}

export type SampleDb = ReturnType<typeof openSampleDb>;
