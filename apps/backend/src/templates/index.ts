// Named query templates: the agent's main data tool. Each has a Lightning SQL (Zetaris) and a SQLite version.
// Every template must filter on :as_of_end so data after as_of is never visible (FR-13).
import type { SampleDb } from "../adapters/local-sqlite.ts";
import interval_series from "./interval_series.ts";
import tariff_rates from "./tariff_rates.ts";
import tou_split from "./tou_split.ts";

export type Template = { params: string[]; lightning: string; sqlite: string };
export const TEMPLATES: Record<string, Template> = { tou_split, interval_series, tariff_rates };
export const MAX_ROWS = 500;

for (const [name, t] of Object.entries(TEMPLATES))
  if (!t.sqlite.includes(":as_of_end") || !t.lightning.includes(":as_of_end")) throw new Error(`Template ${name} must filter on :as_of_end`);

export const asOfEnd = (asOf: string) => {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)} 00:00:00`;
};

export function querySqlite(db: SampleDb, name: string, params: Record<string, string | number>, asOf: string) {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`Unknown template ${name}`);
  const missing = t.params.filter((p) => params[p] === undefined);
  if (missing.length) throw new Error(`Template ${name} missing params: ${missing.join(", ")}`);
  const bound = Object.fromEntries(t.params.map((p) => [p, params[p]]));
  const rows = db.prepare(t.sqlite).all({ ...bound, as_of_end: asOfEnd(asOf) }) as Record<string, any>[];
  return rows.slice(0, MAX_ROWS);
}
