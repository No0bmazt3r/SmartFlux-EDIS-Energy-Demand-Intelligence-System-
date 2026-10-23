// Named query templates: the agent's main data tool. Each has a Lightning SQL (Zetaris) and a SQLite version.
// Every template must filter on :as_of_end so data after as_of is never visible (FR-13).
import type { SampleDb } from "../adapters/local-sqlite.ts";
import cycle_duration from "./cycle_duration.ts";
import cycle_overlap from "./cycle_overlap.ts";
import interval_series from "./interval_series.ts";
import holidays_range from "./holidays_range.ts";
import machine_list from "./machine_list.ts";
import outlet_info from "./outlet_info.ts";
import service_history from "./service_history.ts";
import services_range from "./services_range.ts";
import solar_inputs from "./solar_inputs.ts";
import solar_params from "./solar_params.ts";
import tariff_rates from "./tariff_rates.ts";
import tou_split from "./tou_split.ts";
import weather_range from "./weather_range.ts";

// maxRows caps what a template returns; calculators that need every interval set a higher cap.
// static: a registry table with no time dimension, exempt from the as_of filter.
export type Template = { params: string[]; lightning: string; sqlite: string; maxRows?: number; static?: boolean };
export const TEMPLATES: Record<string, Template> = {
  tou_split, interval_series, tariff_rates, cycle_overlap, machine_list, cycle_duration, service_history, weather_range,
  outlet_info, holidays_range, solar_inputs, solar_params, services_range,
};
export const MAX_ROWS = 500;

for (const [name, t] of Object.entries(TEMPLATES))
  if (!t.static && (!t.sqlite.includes(":as_of_end") || !t.lightning.includes(":as_of_end"))) throw new Error(`Template ${name} must filter on :as_of_end`);

export const asOfEnd = (asOf: string) => {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)} 00:00:00`;
};

// Checks a template call and returns the template with exactly its parameters (plus :as_of_end).
export function prepare(name: string, params: Record<string, string | number>, asOf: string) {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`Unknown template ${name}`);
  const missing = t.params.filter((p) => params[p] === undefined);
  if (missing.length) throw new Error(`Template ${name} missing params: ${missing.join(", ")}`);
  const bound: Record<string, string | number> = Object.fromEntries(t.params.map((p) => [p, params[p]]));
  return { t, bound: t.static ? bound : { ...bound, as_of_end: asOfEnd(asOf) }, cap: t.maxRows ?? MAX_ROWS };
}

export function checkCap(name: string, rows: unknown[], cap: number) {
  if (rows.length > cap) throw new Error(`Template ${name} returned ${rows.length} rows, over its cap of ${cap}; narrow the range`);
  return rows as Record<string, any>[];
}

export function querySqlite(db: SampleDb, name: string, params: Record<string, string | number>, asOf: string) {
  const { t, bound, cap } = prepare(name, params, asOf);
  return checkCap(name, db.prepare(t.sqlite).all(bound), cap);
}
