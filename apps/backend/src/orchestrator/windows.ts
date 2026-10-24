// Date windows the recipes compare. Baseline = the first full week of data (session 1 learns it);
// current = the 14 days up to as_of. ponytail: baseline is recomputed each run until H-MEM stores it (phase 7).
import { WINDOW } from "./state.ts";

export const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
export const ts = (d: string) => `${d} 00:00:00`;
export type Range = { from: string; to: string }; // dates, to exclusive

export function compareWindows(asOf: string): { baseline: Range; current: Range } | undefined {
  const baseline = { from: WINDOW.start, to: addDays(WINDOW.start, 7) };
  const current = { from: addDays(asOf, -13), to: addDays(asOf, 1) };
  return current.from >= baseline.to ? { baseline, current } : undefined;
}

export const days = (r: Range) => (Date.parse(r.to) - Date.parse(r.from)) / 86400000;
export const fmt = (d: string, lang: "en" | "ms" = "en") => new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === "ms" ? "ms-MY" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
